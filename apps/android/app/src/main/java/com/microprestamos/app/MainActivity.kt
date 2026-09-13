package com.microprestamos.app

import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream

class MainActivity : ComponentActivity() {
  override fun onCreate(state: Bundle?) { super.onCreate(state); setContent { MicroPrestamosApp() } }
}

private enum class Step(val title: String) { WELCOME("Bienvenido"), AUTH("Validá tu teléfono"), PERSONAL("Tus datos"), CONTACTS("Contactos"), BANK("Cuenta y documentos"), SIMULATION("Resumen"), STATUS("Solicitud enviada") }

@OptIn(ExperimentalMaterial3Api::class)
@Composable fun MicroPrestamosApp() {
  var step by remember { mutableStateOf(Step.WELCOME) }
  var phone by remember { mutableStateOf("") }; var otp by remember { mutableStateOf("") }; var otpSent by remember { mutableStateOf(false) }
  var session by remember { mutableStateOf<MobileSession?>(null) }; var error by remember { mutableStateOf<String?>(null) }; var busy by remember { mutableStateOf(false) }
  var name by remember { mutableStateOf("") }; var dni by remember { mutableStateOf("") }; var birthDate by remember { mutableStateOf("") }; var email by remember { mutableStateOf("") }; var address by remember { mutableStateOf("") }
  var contact1Name by remember { mutableStateOf("") }; var contact1Relationship by remember { mutableStateOf("") }; var contact1Phone by remember { mutableStateOf("") }
  var contact2Name by remember { mutableStateOf("") }; var contact2Relationship by remember { mutableStateOf("") }; var contact2Phone by remember { mutableStateOf("") }
  var cbu by remember { mutableStateOf("") }; var holderName by remember { mutableStateOf("") }; var termsAccepted by remember { mutableStateOf(false) }; var privacyAccepted by remember { mutableStateOf(false) }
  var amount by remember { mutableStateOf("10000") }; var product by remember { mutableStateOf<LoanProduct?>(null) }; var quote by remember { mutableStateOf<LoanQuote?>(null) }
  var applications by remember { mutableStateOf<List<ClientApplication>>(emptyList()) }
  var loans by remember { mutableStateOf<List<ClientLoan>>(emptyList()) }
  val documentUris = remember { mutableStateMapOf<String, Uri>() }; var documentTypeToPick by remember { mutableStateOf<String?>(null) }
  val context = LocalContext.current; val scope = rememberCoroutineScope()
  val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri -> documentTypeToPick?.let { if (uri != null) documentUris[it] = uri }; documentTypeToPick = null }
  fun run(block: suspend () -> Unit) { error = null; busy = true; scope.launch { try { block() } catch (e: Exception) { error = e.message ?: "No pudimos completar la operación" } finally { busy = false } } }
  LaunchedEffect(Unit) {
    val saved = SessionStore.load(context)
    if (saved != null) {
      busy = true
      try { val refreshed = SupabaseGateway.refreshSession(saved); SessionStore.save(context, refreshed); session = refreshed; applications = SupabaseGateway.applications(refreshed); loans = SupabaseGateway.loans(refreshed); step = Step.STATUS }
      catch (_: Exception) { SessionStore.clear(context) }
      finally { busy = false }
    }
  }

  MaterialTheme(colorScheme = lightColorScheme(primary = Color(0xFF0F766E))) {
    Scaffold(topBar = { TopAppBar(title = { Text("MicroPréstamos · ${step.title}") }) }) { padding ->
      Column(Modifier.padding(padding).padding(24.dp).fillMaxSize().verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        error?.let { Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)) { Text(it, Modifier.padding(12.dp)) } }
        when (step) {
          Step.WELCOME -> {
            Text("Dinero simple, claro y responsable", style = MaterialTheme.typography.headlineSmall)
            Text("La solicitud no garantiza aprobación ni desembolso. Un analista revisará cada expediente.")
            if (!SupabaseGateway.isConfigured) Text("Esta compilación necesita una clave publicable de Supabase antes de poder autenticarte.", color = MaterialTheme.colorScheme.error)
            Button(onClick = { step = Step.AUTH }, modifier = Modifier.fillMaxWidth()) { Text("Comenzar") }
          }
          Step.AUTH -> {
            Text("Ingresá tu teléfono con código de país, por ejemplo +54911…", style = MaterialTheme.typography.titleMedium)
            Field("Teléfono", phone, keyboard = true) { phone = it.filter { c -> c.isDigit() || c == '+' }.take(16) }
            if (otpSent) Field("Código de 6 dígitos", otp, keyboard = true) { otp = it.filter(Char::isDigit).take(6) }
            Button(enabled = !busy && LoanInputValidation.isPhone(phone), onClick = {
              if (!otpSent) run { SupabaseGateway.requestOtp(phone); otpSent = true } else run { val newSession = SupabaseGateway.verifyOtp(phone, otp); SessionStore.save(context, newSession); session = newSession; applications = SupabaseGateway.applications(newSession); loans = SupabaseGateway.loans(newSession); step = Step.PERSONAL }
            }, modifier = Modifier.fillMaxWidth()) { Text(if (busy) "Procesando…" else if (otpSent) "Validar código" else "Enviar código") }
          }
          Step.PERSONAL -> {
            Text("Datos personales", style = MaterialTheme.typography.headlineSmall)
            Field("Nombre y apellido", name) { name = it }; Field("DNI", dni, keyboard = true) { dni = it.filter(Char::isDigit).take(11) }
            Field("Fecha de nacimiento (AAAA-MM-DD)", birthDate) { birthDate = it.take(10) }; Field("Correo (opcional)", email) { email = it }
            Field("Domicilio", address) { address = it }
            Next(name.length >= 2 && dni.length in 7..11 && LoanInputValidation.isBirthDate(birthDate)) { step = Step.CONTACTS }
          }
          Step.CONTACTS -> {
            Text("Dos contactos de emergencia autorizados", style = MaterialTheme.typography.headlineSmall)
            Text("Confirmás que contás con autorización para aportar sus datos.")
            ContactFields("Contacto 1", contact1Name, { contact1Name = it }, contact1Relationship, { contact1Relationship = it }, contact1Phone, { contact1Phone = it })
            ContactFields("Contacto 2", contact2Name, { contact2Name = it }, contact2Relationship, { contact2Relationship = it }, contact2Phone, { contact2Phone = it })
            Next(LoanInputValidation.isEmergencyContact(contact1Name, contact1Relationship, contact1Phone) && LoanInputValidation.isEmergencyContact(contact2Name, contact2Relationship, contact2Phone)) { step = Step.BANK }
          }
          Step.BANK -> {
            Text("Cuenta y documentación", style = MaterialTheme.typography.headlineSmall)
            Field("CBU de 22 dígitos", cbu, keyboard = true) { cbu = it.filter(Char::isDigit).take(22) }; Field("Titular de la cuenta", holderName) { holderName = it }
            Text("Adjuntá DNI frente, DNI dorso y constancia de CBU. Máximo 10 MB; JPG, PNG o PDF.")
            DocumentButton("DNI frente", "dni_front", documentUris, picker, onPick = { documentTypeToPick = it })
            DocumentButton("DNI dorso", "dni_back", documentUris, picker, onPick = { documentTypeToPick = it })
            DocumentButton("Constancia de CBU", "cbu_certificate", documentUris, picker, onPick = { documentTypeToPick = it })
            Row { Checkbox(termsAccepted, { termsAccepted = it }); Text("Acepto los términos provisionales (modo demo)", Modifier.padding(top = 12.dp)) }
            Row { Checkbox(privacyAccepted, { privacyAccepted = it }); Text("Acepto la política de privacidad provisional", Modifier.padding(top = 12.dp)) }
            Button(enabled = !busy && LoanInputValidation.isValidCbu(cbu) && holderName.length >= 2 && termsAccepted && privacyAccepted && documentUris.size == 3 && session != null, onClick = {
              run {
                val current = requireNotNull(session)
                val contacts = JSONArray().put(JSONObject().put("full_name", contact1Name).put("relationship", contact1Relationship).put("phone", contact1Phone).put("consent_declared", true)).put(JSONObject().put("full_name", contact2Name).put("relationship", contact2Relationship).put("phone", contact2Phone).put("consent_declared", true))
                SupabaseGateway.saveProfile(current, JSONObject().put("full_name", name).put("dni", dni).put("birth_date", birthDate).put("phone", phone).put("email", email).put("address", address).put("contacts", contacts).put("cbu", cbu).put("holder_name", holderName).put("terms_version", "demo-2026-09").put("privacy_version", "demo-2026-09"))
                documentUris.forEach { (type, uri) ->
                  val bytes = readDocumentBytes(context, uri)
                  val mime = context.contentResolver.getType(uri) ?: "application/pdf"
                  SupabaseGateway.uploadAndRegisterDocument(current, type, mime, bytes)
                }
                product = SupabaseGateway.products(current).firstOrNull() ?: throw GatewayException("No hay productos activos")
                quote = SupabaseGateway.quote(current, amount.toDoubleOrNull() ?: 0.0, requireNotNull(product)); step = Step.SIMULATION
              }
            }, modifier = Modifier.fillMaxWidth()) { Text(if (busy) "Guardando…" else "Guardar y calcular") }
          }
          Step.SIMULATION -> {
            val selected = product; val currentQuote = quote
            Text("Oferta informativa", style = MaterialTheme.typography.headlineSmall); Field("Monto solicitado (ARS)", amount, keyboard = true) { amount = it.filter(Char::isDigit); quote = null }
            if (selected != null && currentQuote != null) Card { Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) { Text(selected.name, style = MaterialTheme.typography.titleMedium); Text("Capital: $ ${money(amount.toDoubleOrNull() ?: 0.0)}"); Text("Interés plano ${selected.rate}%: $ ${money(currentQuote.interest)}"); Text("Total: $ ${money(currentQuote.total)}"); Text("${selected.installments} cuotas mensuales de $ ${money(currentQuote.installment)}") } }
            Button(enabled = !busy && selected != null && session != null && (amount.toDoubleOrNull() ?: 0.0) > 0, onClick = { run { quote = SupabaseGateway.quote(requireNotNull(session), amount.toDoubleOrNull() ?: 0.0, requireNotNull(selected)) } }, modifier = Modifier.fillMaxWidth()) { Text(if (busy) "Actualizando…" else "Actualizar cotización") }
            Text("La oferta es informativa. Al enviarla, pasa a revisión humana; no se transfiere dinero automáticamente.")
            Button(enabled = !busy && selected != null && currentQuote != null && session != null, onClick = { run { val current = requireNotNull(session); SupabaseGateway.createApplication(current, amount.toDoubleOrNull() ?: 0.0, requireNotNull(selected)); applications = SupabaseGateway.applications(current); loans = SupabaseGateway.loans(current); step = Step.STATUS } }, modifier = Modifier.fillMaxWidth()) { Text(if (busy) "Enviando…" else "Enviar solicitud") }
          }
          Step.STATUS -> { Text("Mis solicitudes", style = MaterialTheme.typography.headlineSmall); Text("No hay aprobación ni desembolso garantizados. Los cambios de estado se actualizan al abrir la app."); if (applications.isEmpty()) Text("Todavía no tenés solicitudes enviadas.") else applications.forEach { application -> Card { Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) { Text("Solicitud ${application.status.replace('_', ' ')}", style = MaterialTheme.typography.titleMedium); Text("Solicitado: $ ${money(application.requestedAmount)} · Total: $ ${money(application.totalDue)}"); Text("${application.installmentCount} cuotas de $ ${money(application.installmentAmount)}") } } }; if (loans.isNotEmpty()) { Text("Mis préstamos", style = MaterialTheme.typography.headlineSmall); loans.forEach { loan -> Card { Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) { Text("Préstamo ${loan.status.replace('_', ' ')}", style = MaterialTheme.typography.titleMedium); Text("Capital: $ ${money(loan.principal)} · Total: $ ${money(loan.total)}"); loan.installments.forEach { installment -> Text("Cuota ${installment.number} · ${installment.dueDate} · $ ${money(installment.paid)} / $ ${money(installment.total)} · ${installment.status}") } } } } }; Button(enabled = !busy && session != null, onClick = { run { val current = requireNotNull(session); applications = SupabaseGateway.applications(current); loans = SupabaseGateway.loans(current) } }, modifier = Modifier.fillMaxWidth()) { Text(if (busy) "Actualizando…" else "Actualizar estado") }; OutlinedButton(onClick = { SessionStore.clear(context); session = null; applications = emptyList(); loans = emptyList(); step = Step.WELCOME }, modifier = Modifier.fillMaxWidth()) { Text("Cerrar sesión") } }
        }
      }
    }
  }
}

@Composable private fun Field(label: String, value: String, keyboard: Boolean = false, onChange: (String) -> Unit) = OutlinedTextField(value, onChange, label = { Text(label) }, modifier = Modifier.fillMaxWidth())
@Composable private fun Next(enabled: Boolean, action: () -> Unit) = Button(enabled = enabled, onClick = action, modifier = Modifier.fillMaxWidth()) { Text("Continuar") }
@Composable private fun ContactFields(title: String, name: String, setName: (String) -> Unit, relationship: String, setRelationship: (String) -> Unit, phone: String, setPhone: (String) -> Unit) { Text(title, style = MaterialTheme.typography.titleMedium); Field("Nombre", name, onChange = setName); Field("Vínculo", relationship, onChange = setRelationship); Field("Teléfono (+código país)", phone, keyboard = true) { setPhone(it.filter { c -> c.isDigit() || c == '+' }.take(16)) } }
@Composable private fun DocumentButton(label: String, type: String, uris: Map<String, Uri>, picker: androidx.activity.result.ActivityResultLauncher<Array<String>>, onPick: (String) -> Unit) = OutlinedButton(onClick = { onPick(type); picker.launch(arrayOf("image/jpeg", "image/png", "application/pdf")) }, modifier = Modifier.fillMaxWidth()) { Text(if (uris.containsKey(type)) "$label ✓" else "Seleccionar $label") }
private fun money(value: Double) = String.format("%,.2f", value)
private fun readDocumentBytes(context: android.content.Context, uri: Uri): ByteArray {
  val maxSize = 10_485_760
  return context.contentResolver.openInputStream(uri)?.use { stream ->
    val output = ByteArrayOutputStream(); val buffer = ByteArray(8192); var total = 0
    while (true) { val read = stream.read(buffer); if (read < 0) break; total += read; if (total > maxSize) throw GatewayException("El documento supera el máximo de 10 MB"); output.write(buffer, 0, read) }
    output.toByteArray()
  } ?: throw GatewayException("No se pudo leer un documento")
}
