package com.microprestamos.app

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

data class MobileSession(val accessToken: String, val refreshToken: String, val userId: String, val expiresAtEpochSeconds: Long)
data class LoanProduct(val id: String, val name: String, val minAmount: Double, val maxAmount: Double, val rate: Double, val installments: Int, val fees: Double)
data class LoanQuote(val interest: Double, val total: Double, val installment: Double)
data class ClientApplication(val id: String, val status: String, val requestedAmount: Double, val totalDue: Double, val installmentAmount: Double, val installmentCount: Int, val submittedAt: String?)
data class ClientInstallment(val number: Int, val dueDate: String, val total: Double, val paid: Double, val status: String)
data class ClientLoan(val id: String, val status: String, val principal: Double, val total: Double, val installments: List<ClientInstallment>)

class GatewayException(message: String) : Exception(message)

/** Uses only the project URL and publishable key; sensitive operations still require a user JWT. */
object SupabaseGateway {
  private val baseUrl get() = BuildConfig.SUPABASE_URL.trimEnd('/')
  private val publishableKey get() = BuildConfig.SUPABASE_PUBLISHABLE_KEY
  val isConfigured get() = baseUrl.startsWith("https://") && publishableKey.startsWith("sb_publishable_")

  suspend fun requestOtp(phone: String) = withContext(Dispatchers.IO) {
    requireConfigured()
    request("POST", "/auth/v1/otp", null, JSONObject().put("phone", phone))
  }

  suspend fun verifyOtp(phone: String, code: String): MobileSession = withContext(Dispatchers.IO) {
    requireConfigured()
    val response = request("POST", "/auth/v1/verify", null, JSONObject().put("phone", phone).put("token", code).put("type", "sms"))
    sessionFrom(response)
  }

  suspend fun refreshSession(session: MobileSession): MobileSession = withContext(Dispatchers.IO) {
    requireConfigured()
    sessionFrom(request("POST", "/auth/v1/token?grant_type=refresh_token", null, JSONObject().put("refresh_token", session.refreshToken)))
  }

  suspend fun saveProfile(session: MobileSession, profile: JSONObject) = withContext(Dispatchers.IO) {
    request("POST", "/functions/v1/client-api/profile", session.accessToken, profile)
  }

  suspend fun products(session: MobileSession): List<LoanProduct> = withContext(Dispatchers.IO) {
    val response = request("GET", "/functions/v1/client-api/products", session.accessToken)
    val values = response.optJSONArray("products") ?: JSONArray()
    buildList {
      for (index in 0 until values.length()) {
        val item = values.getJSONObject(index)
        add(LoanProduct(item.getString("id"), item.getString("name"), item.getDouble("min_amount"), item.getDouble("max_amount"), item.getDouble("interest_rate_percent"), item.getInt("installment_count"), item.optDouble("fees", 0.0)))
      }
    }
  }

  suspend fun quote(session: MobileSession, amount: Double, product: LoanProduct): LoanQuote = withContext(Dispatchers.IO) {
    val response = request("POST", "/functions/v1/client-api/quote", session.accessToken, JSONObject().put("principal", amount).put("interest_rate_percent", product.rate).put("installment_count", product.installments).put("fees", product.fees))
    val quote = response.getJSONObject("quote")
    LoanQuote(quote.getDouble("interest_amount"), quote.getDouble("total_due"), quote.getDouble("installment_amount"))
  }

  suspend fun createApplication(session: MobileSession, amount: Double, product: LoanProduct) = withContext(Dispatchers.IO) {
    request("POST", "/functions/v1/client-api/applications", session.accessToken, JSONObject().put("product_id", product.id).put("requested_amount", amount).put("submit", true))
  }

  suspend fun applications(session: MobileSession): List<ClientApplication> = withContext(Dispatchers.IO) {
    val response = request("GET", "/functions/v1/client-api/applications", session.accessToken)
    val values = response.optJSONArray("applications") ?: JSONArray()
    buildList {
      for (index in 0 until values.length()) {
        val item = values.getJSONObject(index)
        add(ClientApplication(item.getString("id"), item.getString("status"), item.getDouble("requested_amount"), item.getDouble("total_due"), item.getDouble("installment_amount"), item.getInt("installment_count"), item.optString("submitted_at").ifBlank { null }))
      }
    }
  }

  suspend fun loans(session: MobileSession): List<ClientLoan> = withContext(Dispatchers.IO) {
    val response = request("GET", "/functions/v1/client-api/loans", session.accessToken)
    val values = response.optJSONArray("loans") ?: JSONArray()
    buildList {
      for (index in 0 until values.length()) {
        val loan = values.getJSONObject(index); val schedule = loan.optJSONArray("installments") ?: JSONArray()
        add(ClientLoan(loan.getString("id"), loan.getString("status"), loan.getDouble("principal"), loan.getDouble("total_due"), buildList {
          for (itemIndex in 0 until schedule.length()) { val item = schedule.getJSONObject(itemIndex); add(ClientInstallment(item.getInt("installment_number"), item.getString("due_date"), item.getDouble("total_amount"), item.getDouble("paid_amount"), item.getString("status"))) }
        }))
      }
    }
  }

  suspend fun uploadAndRegisterDocument(session: MobileSession, type: String, mimeType: String, bytes: ByteArray) = withContext(Dispatchers.IO) {
    requireConfigured()
    if (type !in setOf("dni_front", "dni_back", "cbu_certificate") || mimeType !in setOf("image/jpeg", "image/png", "application/pdf") || bytes.isEmpty() || bytes.size > 10_485_760) throw GatewayException("Documento inválido o demasiado grande")
    val extension = if (mimeType == "application/pdf") "pdf" else if (mimeType == "image/png") "png" else "jpg"
    val path = "${session.userId}/$type-${System.currentTimeMillis()}.$extension"
    uploadBytes("/storage/v1/object/client-documents/$path", session.accessToken, mimeType, bytes)
    val sha256 = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
    request("POST", "/functions/v1/client-api/documents", session.accessToken, JSONObject().put("document_type", type).put("storage_path", path).put("mime_type", mimeType).put("file_size_bytes", bytes.size).put("sha256", sha256))
  }

  private fun requireConfigured() {
    if (!isConfigured) throw GatewayException("Falta configurar SUPABASE_PUBLISHABLE_KEY en local.properties. Nunca uses una clave service role en la app.")
  }

  private fun sessionFrom(response: JSONObject): MobileSession {
    val user = response.optJSONObject("user") ?: throw GatewayException("No se recibió la identidad del usuario")
    val accessToken = response.optString("access_token")
    val refreshToken = response.optString("refresh_token")
    val userId = user.optString("id")
    val expiresIn = response.optLong("expires_in", 0)
    if (accessToken.isBlank() || refreshToken.isBlank() || userId.isBlank() || expiresIn <= 0) throw GatewayException("La sesión recibida no es válida")
    return MobileSession(accessToken, refreshToken, userId, System.currentTimeMillis() / 1000 + expiresIn)
  }

  private fun request(method: String, path: String, token: String?, payload: JSONObject? = null): JSONObject {
    val connection = (URL(baseUrl + path).openConnection() as HttpURLConnection).apply {
      requestMethod = method; connectTimeout = 15_000; readTimeout = 20_000
      setRequestProperty("apikey", publishableKey); setRequestProperty("Accept", "application/json")
      if (token != null) setRequestProperty("Authorization", "Bearer $token")
      if (payload != null) { doOutput = true; setRequestProperty("Content-Type", "application/json"); outputStream.use { it.write(payload.toString().toByteArray()) } }
    }
    val code = connection.responseCode
    val body = (if (code in 200..299) connection.inputStream else connection.errorStream)?.bufferedReader()?.use(BufferedReader::readText).orEmpty()
    connection.disconnect()
    if (code !in 200..299) {
      val message = runCatching { JSONObject(body).optString("error") }.getOrDefault("")
      throw GatewayException(if (message.isBlank()) "Error de conexión ($code)" else message)
    }
    return JSONObject(body)
  }

  private fun uploadBytes(path: String, token: String, mimeType: String, bytes: ByteArray) {
    val connection = (URL(baseUrl + path).openConnection() as HttpURLConnection).apply {
      requestMethod = "POST"; connectTimeout = 15_000; readTimeout = 30_000; doOutput = true
      setRequestProperty("apikey", publishableKey); setRequestProperty("Authorization", "Bearer $token"); setRequestProperty("Content-Type", mimeType)
      outputStream.use { it.write(bytes) }
    }
    val code = connection.responseCode
    val body = (if (code in 200..299) connection.inputStream else connection.errorStream)?.bufferedReader()?.use(BufferedReader::readText).orEmpty()
    connection.disconnect()
    if (code !in 200..299) throw GatewayException("No se pudo subir el documento (${if (body.isBlank()) code else body})")
  }
}
