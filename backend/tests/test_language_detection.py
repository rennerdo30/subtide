"""Tests for language detection utilities."""

import unittest
from backend.utils.language_detection import (
    is_likely_english,
    is_likely_target_language,
    is_likely_target_latin_language,
    count_language_markers,
    validate_batch_language,
    detect_source_language_leakage,
)


class TestIsLikelyEnglish(unittest.TestCase):
    """Tests for English detection."""

    def test_english_text_detected(self):
        """English text should be detected."""
        text = "I have a problem and I need to find the solution."
        self.assertTrue(is_likely_english(text))

    def test_english_with_common_words(self):
        """Text with multiple English markers should be detected."""
        text = "I have a problem and I don't know what to do."
        self.assertTrue(is_likely_english(text))

    def test_german_not_english(self):
        """German text should not be detected as English."""
        text = "Das ist ein sehr schöner Tag heute."
        self.assertFalse(is_likely_english(text))

    def test_french_not_english(self):
        """French text should not be detected as English."""
        text = "Je suis très content de vous voir aujourd'hui."
        self.assertFalse(is_likely_english(text))

    def test_short_text_not_detected(self):
        """Short text should not be confidently detected."""
        text = "Hello"
        self.assertFalse(is_likely_english(text))


class TestCountLanguageMarkers(unittest.TestCase):
    """Tests for language marker counting."""

    def test_german_markers(self):
        """German text should have German markers."""
        text = "Das ist ein sehr schöner Tag und ich bin glücklich."
        count = count_language_markers(text, 'de')
        self.assertGreater(count, 0)

    def test_french_markers(self):
        """French text should have French markers."""
        text = "Je suis content et je veux vous aider avec cette question."
        count = count_language_markers(text, 'fr')
        self.assertGreater(count, 0)

    def test_spanish_markers(self):
        """Spanish text should have Spanish markers."""
        text = "Esto es muy importante para nosotros y queremos ayudar."
        count = count_language_markers(text, 'es')
        self.assertGreater(count, 0)

    def test_english_no_german_markers(self):
        """English text should not have German markers."""
        text = "The quick brown fox jumps over the lazy dog."
        count = count_language_markers(text, 'de')
        self.assertEqual(count, 0)


class TestIsLikelyTargetLatinLanguage(unittest.TestCase):
    """Tests for Latin-based language validation."""

    def test_german_accepted(self):
        """Valid German text should be accepted."""
        text = "Das ist ein sehr wichtiger Tag für uns alle."
        is_valid, reason = is_likely_target_latin_language(text, 'de')
        self.assertTrue(is_valid, f"German text rejected: {reason}")

    def test_french_accepted(self):
        """Valid French text should be accepted."""
        text = "C'est une journée très importante pour nous tous."
        is_valid, reason = is_likely_target_latin_language(text, 'fr')
        self.assertTrue(is_valid, f"French text rejected: {reason}")

    def test_english_rejected_for_german(self):
        """English text should be rejected when German is expected."""
        text = "This is a very important day for all of us."
        is_valid, reason = is_likely_target_latin_language(text, 'de')
        self.assertFalse(is_valid, "English text accepted as German")

    def test_english_rejected_for_french(self):
        """English text should be rejected when French is expected."""
        text = "I would like to help you with this problem today."
        is_valid, reason = is_likely_target_latin_language(text, 'fr')
        self.assertFalse(is_valid, "English text accepted as French")

    def test_english_rejected_for_spanish(self):
        """English text should be rejected when Spanish is expected."""
        text = "The meeting will be held tomorrow at the office."
        is_valid, reason = is_likely_target_latin_language(text, 'es')
        self.assertFalse(is_valid, "English text accepted as Spanish")

    def test_short_text_accepted(self):
        """Short text should be accepted (benefit of doubt)."""
        text = "Hello"
        is_valid, reason = is_likely_target_latin_language(text, 'de')
        self.assertTrue(is_valid)


class TestIsLikelyTargetLanguage(unittest.TestCase):
    """Tests for the main language validation function."""

    def test_japanese_text_valid(self):
        """Japanese text should be valid for Japanese target."""
        text = "これは日本語のテストです。"
        is_valid, reason = is_likely_target_language(text, 'ja')
        self.assertTrue(is_valid, f"Japanese text rejected: {reason}")

    def test_english_invalid_for_japanese(self):
        """English text should be invalid for Japanese target."""
        text = "This is a test in English that should not pass."
        is_valid, reason = is_likely_target_language(text, 'ja')
        self.assertFalse(is_valid, "English text accepted as Japanese")

    def test_korean_text_valid(self):
        """Korean text should be valid for Korean target."""
        text = "이것은 한국어 테스트입니다."
        is_valid, reason = is_likely_target_language(text, 'ko')
        self.assertTrue(is_valid, f"Korean text rejected: {reason}")

    def test_chinese_text_valid(self):
        """Chinese text should be valid for Chinese target."""
        text = "这是中文测试。"
        is_valid, reason = is_likely_target_language(text, 'zh')
        self.assertTrue(is_valid, f"Chinese text rejected: {reason}")

    def test_russian_text_valid(self):
        """Russian (Cyrillic) text should be valid for Russian target."""
        text = "Это тест на русском языке."
        is_valid, reason = is_likely_target_language(text, 'ru')
        self.assertTrue(is_valid, f"Russian text rejected: {reason}")

    def test_english_invalid_for_russian(self):
        """English text should be invalid for Russian target."""
        text = "This is English text that should not be accepted."
        is_valid, reason = is_likely_target_language(text, 'ru')
        self.assertFalse(is_valid, "English text accepted as Russian")

    def test_chinese_rejected_for_japanese(self):
        """Chinese text should be rejected when Japanese is expected."""
        # Pure Chinese text (no Hiragana/Katakana)
        text = "这是一个纯中文的句子，不应该被识别为日语。"
        is_valid, reason = is_likely_target_language(text, 'ja')
        self.assertFalse(is_valid, "Chinese text accepted as Japanese")


class TestValidateBatchLanguage(unittest.TestCase):
    """Tests for batch validation."""

    def test_valid_german_batch(self):
        """Batch of valid German translations should pass."""
        translations = [
            "Das ist sehr gut.",
            "Ich verstehe das nicht.",
            "Wir müssen das besprechen.",
        ]
        is_valid, invalid_indices, reason = validate_batch_language(translations, 'de')
        self.assertTrue(is_valid, f"German batch rejected: {reason}")

    def test_mixed_batch_fails(self):
        """Batch with too many English translations should fail."""
        translations = [
            "I have a problem and I need to find the solution today.",
            "We should go to the store and buy some things for the party.",
            "They are going to have a meeting with the team tomorrow.",
            "Das ist ein sehr wichtiger Tag für uns alle.",  # Only one German
        ]
        is_valid, invalid_indices, reason = validate_batch_language(translations, 'de')
        self.assertFalse(is_valid, "Mixed batch accepted")
        self.assertGreater(len(invalid_indices), 0)

    def test_valid_japanese_batch(self):
        """Batch of valid Japanese translations should pass."""
        translations = [
            "こんにちは",
            "ありがとうございます",
            "お元気ですか",
        ]
        is_valid, invalid_indices, reason = validate_batch_language(translations, 'ja')
        self.assertTrue(is_valid, f"Japanese batch rejected: {reason}")


class TestDetectSourceLanguageLeakage(unittest.TestCase):
    """Tests for source language leakage detection."""

    def test_no_leakage(self):
        """Properly translated text should have no leakage."""
        source = ["Hello", "Goodbye", "Thank you"]
        translations = ["Hallo", "Auf Wiedersehen", "Danke"]
        has_leakage, indices = detect_source_language_leakage(source, translations)
        self.assertFalse(has_leakage)

    def test_exact_copy_detected(self):
        """Exact copy of source should be detected as leakage."""
        source = ["Hello world", "Goodbye", "Thank you"]
        translations = ["Hello world", "Tschüss", "Danke"]  # First is copied
        has_leakage, indices = detect_source_language_leakage(source, translations)
        self.assertIn(0, indices)


if __name__ == '__main__':
    unittest.main()
