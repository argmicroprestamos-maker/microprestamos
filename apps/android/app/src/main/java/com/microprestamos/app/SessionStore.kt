package com.microprestamos.app

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONObject
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Stores a Supabase user session encrypted with an Android Keystore key, never in plain preferences. */
object SessionStore {
  private const val keyAlias = "microprestamos_session_v1"
  private const val preferences = "encrypted_session"
  private const val ciphertext = "ciphertext"
  private const val iv = "iv"

  fun save(context: Context, session: MobileSession) {
    val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, secretKey()) }
    val payload = JSONObject().put("access_token", session.accessToken).put("refresh_token", session.refreshToken).put("user_id", session.userId).put("expires_at", session.expiresAtEpochSeconds).toString().toByteArray()
    context.getSharedPreferences(preferences, Context.MODE_PRIVATE).edit()
      .putString(ciphertext, Base64.encodeToString(cipher.doFinal(payload), Base64.NO_WRAP))
      .putString(iv, Base64.encodeToString(cipher.iv, Base64.NO_WRAP)).apply()
  }

  fun load(context: Context): MobileSession? = runCatching {
    val stored = context.getSharedPreferences(preferences, Context.MODE_PRIVATE)
    val encrypted = stored.getString(ciphertext, null) ?: return null
    val nonce = stored.getString(iv, null) ?: return null
    val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.DECRYPT_MODE, secretKey(), GCMParameterSpec(128, Base64.decode(nonce, Base64.NO_WRAP))) }
    val json = JSONObject(String(cipher.doFinal(Base64.decode(encrypted, Base64.NO_WRAP))))
    MobileSession(json.getString("access_token"), json.getString("refresh_token"), json.getString("user_id"), json.getLong("expires_at"))
  }.getOrElse { clear(context); null }

  fun clear(context: Context) { context.getSharedPreferences(preferences, Context.MODE_PRIVATE).edit().clear().apply() }

  private fun secretKey(): SecretKey {
    val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (keyStore.getKey(keyAlias, null) as? SecretKey)?.let { return it }
    return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
      init(KeyGenParameterSpec.Builder(keyAlias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setKeySize(256).build())
    }.generateKey()
  }
}
