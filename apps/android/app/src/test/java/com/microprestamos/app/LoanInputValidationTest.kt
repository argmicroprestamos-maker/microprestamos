package com.microprestamos.app

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class LoanInputValidationTest {
  @Test fun acceptsValidE164Phone() = assertTrue(LoanInputValidation.isPhone("+5491123456789"))
  @Test fun rejectsInvalidPhone() = assertFalse(LoanInputValidation.isPhone("01123456789"))
  @Test fun validatesRealCalendarDates() {
    assertTrue(LoanInputValidation.isBirthDate("2000-02-29"))
    assertFalse(LoanInputValidation.isBirthDate("2001-02-29"))
  }
  @Test fun validatesCbuChecksumAndRejectsZero() {
    assertTrue(LoanInputValidation.isValidCbu("1111111911111111111117"))
    assertFalse(LoanInputValidation.isValidCbu("1111111911111111111118"))
    assertFalse(LoanInputValidation.isValidCbu("0000000000000000000000"))
  }
  @Test fun requiresACompleteEmergencyContact() {
    assertTrue(LoanInputValidation.isEmergencyContact("Ana", "Hermana", "+5491123456789"))
    assertFalse(LoanInputValidation.isEmergencyContact("A", "Hermana", "+5491123456789"))
  }
}
