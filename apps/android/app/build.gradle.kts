import java.util.Properties

plugins { id("com.android.application"); id("org.jetbrains.kotlin.android"); id("org.jetbrains.kotlin.plugin.compose") }
android { namespace = "com.microprestamos.app"; compileSdk = 35
  val localProperties = Properties().apply {
    val file = rootProject.file("local.properties")
    if (file.exists()) file.inputStream().use(::load)
  }
  defaultConfig { applicationId = "com.microprestamos.app"; minSdk = 26; targetSdk = 35; versionCode = 2; versionName = "0.1.1" }
  compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
  buildFeatures { compose = true; buildConfig = true }
  val supabaseUrl = localProperties.getProperty("SUPABASE_URL") ?: providers.gradleProperty("SUPABASE_URL").orElse("https://yncfmpbapocdxcmqdeke.supabase.co").get()
  val supabasePublishableKey = localProperties.getProperty("SUPABASE_PUBLISHABLE_KEY") ?: providers.gradleProperty("SUPABASE_PUBLISHABLE_KEY").orElse("").get()
  defaultConfig {
    buildConfigField("String", "SUPABASE_URL", "\"$supabaseUrl\"")
    buildConfigField("String", "SUPABASE_PUBLISHABLE_KEY", "\"$supabasePublishableKey\"")
  }
}
kotlin { jvmToolchain(17) }
dependencies { implementation(platform("androidx.compose:compose-bom:2024.12.01")); implementation("androidx.activity:activity-compose:1.10.0"); implementation("androidx.compose.ui:ui"); implementation("androidx.compose.material3:material3"); implementation("androidx.compose.ui:ui-tooling-preview"); implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0"); testImplementation("junit:junit:4.13.2"); debugImplementation("androidx.compose.ui:ui-tooling") }
