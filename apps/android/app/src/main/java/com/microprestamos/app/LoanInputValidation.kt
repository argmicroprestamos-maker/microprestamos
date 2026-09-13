package com.microprestamos.app

import java.time.LocalDate

/** Fast client-side checks. The server remains authoritative for every financial operation. */
object LoanInputValidation {
  private val e164 = Regex("^\\+[1-9][0-9]{7,14}$")
  private val cbuWeights = intArrayOf(7, 1, 3, 9, 7, 1, 3, 3, 9, 7, 1, 3, 9, 7, 1, 3, 9, 7, 1, 3)

  fun isPhone(phone: String) = phone.matches(e164)
  fun isBirthDate(value: String) = runCatching { LocalDate.parse(value) }.isSuccess

  fun isValidCbu(value: String): Boolean {
    if (!value.matches(Regex("^[0-9]{22}$")) || value.all { it == '0' }) return false
    fun validDigit(digits: String, weights: IntArray, check: Char): Boolean {
      var total = 0
      for (index in digits.indices) total += digits[index].digitToInt() * weights[index]
      return ((10 - total % 10) % 10) == check.digitToInt()
    }
    return validDigit(value.substring(0, 7), cbuWeights.copyOfRange(0, 7), value[7]) &&
      validDigit(value.substring(8, 21), cbuWeights.copyOfRange(7, 20), value[21])
  }

  fun isEmergencyContact(name: String, relationship: String, phone: String) =
    name.trim().length >= 2 && relationship.trim().length >= 2 && isPhone(phone)
}
