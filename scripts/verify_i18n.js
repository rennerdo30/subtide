const fs = require('fs');
const path = require('path');

const localesDir = path.join(__dirname, '../extension/_locales');
const enPath = path.join(localesDir, 'en/messages.json');

function loadJson(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
        console.error(`Error reading ${filePath}:`, e.message);
        process.exit(1);
    }
}

if (!fs.existsSync(enPath)) {
    console.error('❌ English locale not found!');
    process.exit(1);
}

const enMessages = loadJson(enPath);
const enKeys = new Set(Object.keys(enMessages));

// Get all locale directories
const locales = fs.readdirSync(localesDir).filter(file => {
    return fs.statSync(path.join(localesDir, file)).isDirectory() && file !== 'en';
});

let hasError = false;

console.log(`🔍 Verifying ${locales.length} locales against 'en'...\n`);

locales.forEach(locale => {
    const localePath = path.join(localesDir, locale, 'messages.json');

    if (!fs.existsSync(localePath)) {
        console.error(`❌ [${locale}] messages.json not found`);
        hasError = true;
        return;
    }

    const messages = loadJson(localePath);
    const keys = new Set(Object.keys(messages));

    // Check for missing keys
    const missing = [...enKeys].filter(key => !keys.has(key));
    if (missing.length > 0) {
        console.error(`❌ [${locale}] Missing ${missing.length} keys:`);
        missing.forEach(key => console.error(`    - ${key}`));
        hasError = true;
    } else {
        // console.log(`✅ [${locale}] All keys present`);
    }

    // Check for extra keys
    const extra = [...keys].filter(key => !enKeys.has(key));
    if (extra.length > 0) {
        console.warn(`⚠️ [${locale}] Has ${extra.length} extra keys (deprecated?):`);
        extra.forEach(key => console.warn(`    - ${key}`));
    }

    // Check structure (placeholders)
    [...enKeys].forEach(key => {
        if (messages[key]) {
            checkStructure(enMessages[key], messages[key], key, locale);
        }
    });
});

function checkStructure(enObj, targetObj, key, locale) {
    if (enObj.placeholders) {
        if (!targetObj.placeholders) {
            console.error(`❌ [${locale}] Key '${key}' missing placeholders`);
            hasError = true;
            return;
        }
        const enPlaceholders = Object.keys(enObj.placeholders);
        const targetPlaceholders = Object.keys(targetObj.placeholders);

        const missingPh = enPlaceholders.filter(p => !targetPlaceholders.includes(p));
        if (missingPh.length > 0) {
            console.error(`❌ [${locale}] Key '${key}' missing placeholders: ${missingPh.join(', ')}`);
            hasError = true;
        }
    }
}

if (hasError) {
    console.error('\n❌ Verification FAILED');
    process.exit(1);
} else {
    console.log('\n✅ Verification PASSED: All locales match English structure.');
    process.exit(0);
}
