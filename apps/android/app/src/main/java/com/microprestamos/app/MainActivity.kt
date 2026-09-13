package com.microprestamos.app

import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream

class MainActivity : ComponentActivity() {
  override fun onCreate(state: Bundle?) { super.onCreate(state); setContent { MicroPrestamosApp() } }
}

private enum class Step(val title: String) { WELCOME("Bienvenido"), AUTH("Validá tu teléfono"), PERSONAL("Tus datos"), CONTACTS("Contactos"), BANK("Cuenta y documentos"), SIMULATION("Resumen"), STATUS("Solicitud enviada") }

private val BrandTeal = Color(0xFF075E54)
private val BrandTealDark = Color(0xFF043E38)
private val BrandMint = Color(0xFFDDF5EE)
private val BrandOrange = Color(0xFFFF9D5C)
private val PageBackground = Color(0xFFF4F7F6)
private val Ink = Color(0xFF172522)
private val MutedInk = Color(0xFF52615E)

@OptIn(ExperimentalMaterial3Api::class)
@Composable fun MicroPrestamosApp() {
  // Deliberately limited to debug builds: it is never present in a release APK.
  val localOtpDemo = BuildConfig.DEBUG
  val demoPhone = "+5491100000000"
  val demoOtp = "123456"
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

  val appColors = lightColorScheme(primary = BrandTeal, onPrimary = Color.White, primaryContainer = BrandMint, onPrimaryContainer = BrandTealDark, secondary = BrandOrange, onSecondary = Ink, background = PageBackground, onBackground = Ink, surface = Color.White, onSurface = Ink, surfaceVariant = Color(0xFFE8EFEC), onSurfaceVariant = MutedInk)
  val appTypography = Typography(titleLarge = TextStyle(fontSize = 22.sp, lineHeight = 28.sp, fontWeight = FontWeight.Bold), headlineSmall = TextStyle(fontSize = 24.sp, lineHeight = 31.sp, fontWeight = FontWeight.Bold), titleMedium = TextStyle(fontSize = 17.sp, lineHeight = 23.sp, fontWeight = FontWeight.SemiBold), bodyLarge = TextStyle(fontSize = 16.sp, lineHeight = 24.sp), bodyMedium = TextStyle(fontSize = 14.sp, lineHeight = 21.sp))
  MaterialTheme(colorScheme = appColors, typography = appTypography, shapes = Shapes(small = RoundedCornerShape(10.dp), medium = RoundedCornerShape(16.dp), large = RoundedCornerShape(24.dp))) {
    Scaffold(containerColor = PageBackground, topBar = {
      TopAppBar(
        colors = TopAppBarDefaults.topAppBarColors(containerColor = PageBackground),
        navigationIcon = { BrandMark(Modifier.padding(start = 18.dp)) },
        title = { Column { Text("MicroPréstamos", fontWeight = FontWeight.Bold, color = BrandTealDark); Text(step.title, style = MaterialTheme.typography.bodyMedium, color = MutedInk) } }
      )
    }) { padding ->
      Column(Modifier.padding(padding).padding(horizontal = 20.dp).fillMaxSize().verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        if (step != Step.WELCOME) JourneyProgress(step)
        error?.let { ErrorBanner(it) }
        Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(24.dp), colors = CardDefaults.cardColors(containerColor = Color.White), elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)) {
          Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        when (step) {
          Step.WELCOME -> {
            WelcomeHero()
            Text("Crédito claro, desde el primer paso", style = MaterialTheme.typography.headlineSmall, color = BrandTealDark)
            Text("Simulá tu préstamo, cargá tus datos y seguí el estado desde un solo lugar.", color = MutedInk)
            FeatureRow("01", "Solicitud simple", "Completá el proceso en pocos minutos.")
            FeatureRow("02", "Cuotas transparentes", "Ves interés, total y valor de cada cuota.")
            FeatureRow("03", "Revisión responsable", "Cada solicitud es evaluada antes del desembolso.")
            if (!SupabaseGateway.isConfigured) Text("Esta compilación necesita una clave publicable de Supabase antes de poder autenticarte.", color = MaterialTheme.colorScheme.error)
            PrimaryButton("Comenzar solicitud") { step = Step.AUTH }
          }
          Step.AUTH -> {
            SectionIntro("Protejamos tu cuenta", "Ingresá tu teléfono con código de país. Te enviaremos un código para confirmar que sos vos.")
            if (localOtpDemo) Text("Prueba local: usá $demoPhone y el código $demoOtp. No se envía ningún SMS.", color = MaterialTheme.colorScheme.primary)
            Field("Teléfono", phone, keyboard = true) { phone = it.filter { c -> c.isDigit() || c == '+' }.take(16) }
            if (otpSent) Field("Código de 6 dígitos", otp, keyboard = true) { otp = it.filter(Char::isDigit).take(6) }
            Button(enabled = !busy && LoanInputValidation.isPhone(phone), onClick = {
              if (localOtpDemo && phone == demoPhone) {
                if (!otpSent) otpSent = true
                else if (otp == demoOtp) step = Step.PERSONAL
                else error = "Código de prueba incorrecto"
              } else if (!otpSent) run { SupabaseGateway.requestOtp(phone); otpSent = true } else run { val newSession = SupabaseGateway.verifyOtp(phone, otp); SessionStore.save(context, newSession); session = newSession; applications = SupabaseGateway.applications(newSession); loans = SupabaseGateway.loans(newSession); step = Step.PERSONAL }
            }, modifier = Modifier.fillMaxWidth()) { Text(if (busy) "Procesando…" else if (otpSent) "Validar código" else "Enviar código") }
          }
          Step.PERSONAL -> {
            SectionIntro("Contanos sobre vos", "Usaremos estos datos para identificarte y revisar la solicitud.")
            Field("Nombre y apellido", name) { name = it }; Field("DNI", dni, keyboard = true) { dni = it.filter(Char::isDigit).take(11) }
            Field("Fecha de nacimiento (AAAA-MM-DD)", birthDate) { birthDate = it.take(10) }; Field("Correo (opcional)", email) { email = it }
            Field("Domicilio", address) { address = it }
            Next(name.length >= 2 && dni.length in 7..11 && LoanInputValidation.isBirthDate(birthDate)) { step = Step.CONTACTS }
          }
          Step.CONTACTS -> {
            SectionIntro("Contactos de referencia", "Necesitamos dos contactos que te conozcan. Confirmás que tenés autorización para compartir sus datos.")
            ContactFields("Contacto 1", contact1Name, { contact1Name = it }, contact1Relationship, { contact1Relationship = it }, contact1Phone, { contact1Phone = it })
            ContactFields("Contacto 2", contact2Name, { contact2Name = it }, contact2Relationship, { contact2Relationship = it }, contact2Phone, { contact2Phone = it })
            Next(LoanInputValidation.isEmergencyContact(contact1Name, contact1Relationship, contact1Phone) && LoanInputValidation.isEmergencyContact(contact2Name, contact2Relationship, contact2Phone)) { step = Step.BANK }
          }
          Step.BANK -> {
            SectionIntro("Cuenta y documentación", "La cuenta debe estar a tu nombre. Los documentos se usan únicamente para verificar tu identidad.")
            Field("CBU de 22 dígitos", cbu, keyboard = true) { cbu = it.filter(Char::isDigit).take(22) }; Field("Titular de la cuenta", holderName) { holderName = it }
            Text("Adjuntá DNI frente, DNI dorso y constancia de CBU. Máximo 10 MB; JPG, PNG o PDF.")
            DocumentButton("DNI frente", "dni_front", documentUris, picker, onPick = { documentTypeToPick = it })
            DocumentButton("DNI dorso", "dni_back", documentUris, picker, onPick = { documentTypeToPick = it })
            DocumentButton("Constancia de CBU", "cbu_certificate", documentUris, picker, onPick = { documentTypeToPick = it })
            Row { Checkbox(termsAccepted, { termsAccepted = it }); Text("Acepto los términos provisionales (modo demo)", Modifier.padding(top = 12.dp)) }
            Row { Checkbox(privacyAccepted, { privacyAccepted = it }); Text("Acepto la política de privacidad provisional", Modifier.padding(top = 12.dp)) }
            Button(enabled = !busy && LoanInputValidation.isValidCbu(cbu) && holderName.length >= 2 && termsAccepted && privacyAccepted && documentUris.size == 3 && (session != null || localOtpDemo), onClick = {
              run {
                if (localOtpDemo && session == null) {
                  product = demoProduct()
                  quote = demoQuote(amount.toDoubleOrNull() ?: 0.0, requireNotNull(product))
                  step = Step.SIMULATION
                  return@run
                }
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
            SectionIntro("Tu simulación", "Revisá el monto y el detalle antes de enviar la solicitud."); Field("Monto solicitado (ARS)", amount, keyboard = true) { amount = it.filter(Char::isDigit); quote = null }
            if (selected != null && currentQuote != null) Card { Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) { Text(selected.name, style = MaterialTheme.typography.titleMedium); Text("Capital: $ ${money(amount.toDoubleOrNull() ?: 0.0)}"); Text("Interés plano ${selected.rate}%: $ ${money(currentQuote.interest)}"); Text("Total: $ ${money(currentQuote.total)}"); Text("${selected.installments} cuotas mensuales de $ ${money(currentQuote.installment)}") } }
            Button(enabled = !busy && selected != null && (session != null || localOtpDemo) && (amount.toDoubleOrNull() ?: 0.0) > 0, onClick = { run { quote = if (localOtpDemo && session == null) demoQuote(amount.toDoubleOrNull() ?: 0.0, requireNotNull(selected)) else SupabaseGateway.quote(requireNotNull(session), amount.toDoubleOrNull() ?: 0.0, requireNotNull(selected)) } }, modifier = Modifier.fillMaxWidth()) { Text(if (busy) "Actualizando…" else "Actualizar cotización") }
            Text("La oferta es informativa. Al enviarla, pasa a revisión humana; no se transfiere dinero automáticamente.")
            Button(enabled = !busy && selected != null && currentQuote != null && (session != null || localOtpDemo), onClick = { run { if (localOtpDemo && session == null) { applications = listOf(ClientApplication("demo", "en_revision", amount.toDoubleOrNull() ?: 0.0, requireNotNull(currentQuote).total, requireNotNull(currentQuote).installment, requireNotNull(selected).installments, null)); step = Step.STATUS } else { val current = requireNotNull(session); SupabaseGateway.createApplication(current, amount.toDoubleOrNull() ?: 0.0, requireNotNull(selected)); applications = SupabaseGateway.applications(current); loans = SupabaseGateway.loans(current); step = Step.STATUS } } }, modifier = Modifier.fillMaxWidth()) { Text(if (busy) "Enviando…" else "Enviar solicitud") }
          }
          Step.STATUS -> { SectionIntro("Seguimiento", "Acá vas a ver cada cambio de tu solicitud y, cuando corresponda, el detalle de tus cuotas."); if (applications.isEmpty()) Text("Todavía no tenés solicitudes enviadas.", color = MutedInk) else applications.forEach { application -> StatusCard(application) }; if (loans.isNotEmpty()) { Text("Mis préstamos", style = MaterialTheme.typography.headlineSmall); loans.forEach { loan -> Card(colors = CardDefaults.cardColors(containerColor = BrandMint)) { Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) { Text("Préstamo ${loan.status.replace('_', ' ')}", style = MaterialTheme.typography.titleMedium); Text("Capital: $ ${money(loan.principal)} · Total: $ ${money(loan.total)}"); loan.installments.forEach { installment -> Text("Cuota ${installment.number} · ${installment.dueDate} · $ ${money(installment.paid)} / $ ${money(installment.total)} · ${installment.status}") } } } } }; Button(enabled = !busy && session != null, onClick = { run { val current = requireNotNull(session); applications = SupabaseGateway.applications(current); loans = SupabaseGateway.loans(current) } }, modifier = Modifier.fillMaxWidth()) { Text(if (busy) "Actualizando…" else "Actualizar estado") }; OutlinedButton(onClick = { SessionStore.clear(context); session = null; applications = emptyList(); loans = emptyList(); step = Step.WELCOME }, modifier = Modifier.fillMaxWidth()) { Text("Cerrar sesión") } }
        }
          }
        }
        Spacer(Modifier.height(20.dp))
      }
    }
  }
}

@Composable private fun BrandMark(modifier: Modifier = Modifier) {
  Box(modifier.size(42.dp).clip(CircleShape).background(BrandTeal), contentAlignment = Alignment.Center) { Text("$", color = Color.White, fontSize = 23.sp, fontWeight = FontWeight.Bold) }
}

@Composable private fun WelcomeHero() {
  Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(Brush.linearGradient(listOf(BrandTealDark, BrandTeal))).padding(22.dp)) {
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
      Box(Modifier.size(54.dp).clip(CircleShape).background(Color.White.copy(alpha = .16f)).border(1.dp, Color.White.copy(alpha = .25f), CircleShape), contentAlignment = Alignment.Center) { Text("$", color = Color.White, fontSize = 30.sp, fontWeight = FontWeight.Bold) }
      Text("Tu próximo paso,\nmás cerca.", color = Color.White, fontSize = 30.sp, lineHeight = 36.sp, fontWeight = FontWeight.Bold)
      Surface(color = BrandOrange, shape = RoundedCornerShape(50)) { Text("Microcréditos simples", Modifier.padding(horizontal = 14.dp, vertical = 7.dp), color = Ink, fontWeight = FontWeight.SemiBold) }
    }
  }
}

@Composable private fun FeatureRow(number: String, title: String, detail: String) {
  Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
    Box(Modifier.size(38.dp).clip(CircleShape).background(BrandMint), contentAlignment = Alignment.Center) { Text(number, color = BrandTeal, fontWeight = FontWeight.Bold, fontSize = 12.sp) }
    Column(Modifier.weight(1f)) { Text(title, fontWeight = FontWeight.SemiBold, color = Ink); Text(detail, style = MaterialTheme.typography.bodyMedium, color = MutedInk) }
  }
}

@Composable private fun SectionIntro(title: String, detail: String) {
  Column(verticalArrangement = Arrangement.spacedBy(6.dp)) { Text(title, style = MaterialTheme.typography.headlineSmall, color = BrandTealDark); Text(detail, color = MutedInk) }
}

@Composable private fun JourneyProgress(step: Step) {
  val current = step.ordinal.coerceAtMost(Step.SIMULATION.ordinal)
  Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(7.dp)) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) { Text("Paso $current de ${Step.SIMULATION.ordinal}", style = MaterialTheme.typography.bodyMedium, color = MutedInk); Text(step.title, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, color = BrandTeal) }
    LinearProgressIndicator(progress = { current.toFloat() / Step.SIMULATION.ordinal }, modifier = Modifier.fillMaxWidth().height(7.dp).clip(CircleShape), color = BrandTeal, trackColor = Color(0xFFDDE7E3))
  }
}

@Composable private fun ErrorBanner(message: String) = Card(colors = CardDefaults.cardColors(containerColor = Color(0xFFFFE9E5)), shape = RoundedCornerShape(16.dp)) { Row(Modifier.padding(14.dp), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) { Text("!", Modifier.size(28.dp).clip(CircleShape).background(Color(0xFFB3261E)).padding(top = 3.dp), color = Color.White, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center); Text(message, Modifier.weight(1f), color = Color(0xFF7D241D)) } }

@Composable private fun PrimaryButton(label: String, action: () -> Unit) = Button(onClick = action, shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth().height(56.dp)) { Text(label, fontWeight = FontWeight.Bold) }

@Composable private fun StatusCard(application: ClientApplication) {
  Card(colors = CardDefaults.cardColors(containerColor = BrandMint), shape = RoundedCornerShape(18.dp)) {
    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
      Surface(color = Color.White, shape = CircleShape) { Text(application.status.replace('_', ' ').uppercase(), Modifier.padding(horizontal = 11.dp, vertical = 5.dp), color = BrandTeal, fontWeight = FontWeight.Bold, fontSize = 11.sp) }
      Text("Solicitud por $ ${money(application.requestedAmount)}", style = MaterialTheme.typography.titleMedium, color = BrandTealDark)
      Text("Total: $ ${money(application.totalDue)}", color = MutedInk)
      Text("${application.installmentCount} cuotas de $ ${money(application.installmentAmount)}", color = MutedInk)
    }
  }
}

@Composable private fun Field(label: String, value: String, keyboard: Boolean = false, onChange: (String) -> Unit) = OutlinedTextField(value, onChange, label = { Text(label) }, singleLine = true, shape = RoundedCornerShape(14.dp), colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = BrandTeal, focusedLabelColor = BrandTeal, unfocusedBorderColor = Color(0xFFB9C8C3)), modifier = Modifier.fillMaxWidth())
@Composable private fun Next(enabled: Boolean, action: () -> Unit) = Button(enabled = enabled, onClick = action, shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth().height(54.dp)) { Text("Continuar", fontWeight = FontWeight.SemiBold) }
@Composable private fun ContactFields(title: String, name: String, setName: (String) -> Unit, relationship: String, setRelationship: (String) -> Unit, phone: String, setPhone: (String) -> Unit) { Text(title, style = MaterialTheme.typography.titleMedium); Field("Nombre", name, onChange = setName); Field("Vínculo", relationship, onChange = setRelationship); Field("Teléfono (+código país)", phone, keyboard = true) { setPhone(it.filter { c -> c.isDigit() || c == '+' }.take(16)) } }
@Composable private fun DocumentButton(label: String, type: String, uris: Map<String, Uri>, picker: androidx.activity.result.ActivityResultLauncher<Array<String>>, onPick: (String) -> Unit) = OutlinedButton(onClick = { onPick(type); picker.launch(arrayOf("image/jpeg", "image/png", "application/pdf")) }, shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth().height(54.dp)) { Text(if (uris.containsKey(type)) "$label  ✓" else "Adjuntar $label", fontWeight = FontWeight.Medium) }
private fun money(value: Double) = String.format("%,.2f", value)
private fun demoProduct() = LoanProduct("demo", "Crédito de prueba", 1_000.0, 100_000.0, 20.0, 3, 0.0)
private fun demoQuote(amount: Double, product: LoanProduct): LoanQuote { val interest = amount * product.rate / 100; val total = amount + interest; return LoanQuote(interest, total, total / product.installments) }
private fun readDocumentBytes(context: android.content.Context, uri: Uri): ByteArray {
  val maxSize = 10_485_760
  return context.contentResolver.openInputStream(uri)?.use { stream ->
    val output = ByteArrayOutputStream(); val buffer = ByteArray(8192); var total = 0
    while (true) { val read = stream.read(buffer); if (read < 0) break; total += read; if (total > maxSize) throw GatewayException("El documento supera el máximo de 10 MB"); output.write(buffer, 0, read) }
    output.toByteArray()
  } ?: throw GatewayException("No se pudo leer un documento")
}
