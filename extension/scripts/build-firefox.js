#!/usr/bin/env node

/**
 * Firefox Extension Build Script
 *
 * Converts the Chrome MV3 manifest to Firefox-compatible format.
 * Firefox differences:
 * - Uses `scripts` array instead of `service_worker` in background
 * - Requires `browser_specific_settings` with gecko ID
 * - Some APIs may need polyfills (handled at runtime)
 */

const fs = require('fs');
const path = require('path');

const extensionDir = path.resolve(__dirname, '..');
const chromeManifestPath = path.join(extensionDir, 'manifest.json');
const firefoxManifestPath = path.join(extensionDir, 'manifest.firefox.json');

function convertToFirefox() {
    console.log('Reading Chrome manifest...');
    const chromeManifest = JSON.parse(fs.readFileSync(chromeManifestPath, 'utf8'));

    // Create Firefox manifest from Chrome manifest
    const firefoxManifest = { ...chromeManifest };

    // Add Firefox-specific settings
    firefoxManifest.browser_specific_settings = {
        gecko: {
            id: 'subtide@rennerdo30.dev',
            strict_min_version: '109.0'
        }
    };

    // Convert background service_worker to scripts array
    // Firefox MV3 supports background scripts differently
    if (firefoxManifest.background && firefoxManifest.background.service_worker) {
        firefoxManifest.background = {
            scripts: [firefoxManifest.background.service_worker],
            type: 'module'
        };
    }

    // Remove Chrome-specific permissions that Firefox doesn't support
    // tabCapture is not supported in Firefox in the same way
    if (firefoxManifest.permissions) {
        firefoxManifest.permissions = firefoxManifest.permissions.filter(
            p => !['tabCapture'].includes(p)
        );
    }

    // Firefox doesn't support offscreen documents
    // Remove offscreen permission if present
    if (firefoxManifest.permissions) {
        firefoxManifest.permissions = firefoxManifest.permissions.filter(
            p => p !== 'offscreen'
        );
    }

    // Write Firefox manifest
    console.log('Writing Firefox manifest...');
    fs.writeFileSync(
        firefoxManifestPath,
        JSON.stringify(firefoxManifest, null, 2) + '\n',
        'utf8'
    );

    console.log(`Firefox manifest created: ${firefoxManifestPath}`);
    console.log('\nFirefox-specific changes applied:');
    console.log('  - Added browser_specific_settings with gecko ID');
    console.log('  - Converted service_worker to background scripts array');
    console.log('  - Removed tabCapture permission (not supported)');
    console.log('  - Removed offscreen permission (not supported)');

    return firefoxManifest;
}

// Run if called directly
if (require.main === module) {
    try {
        convertToFirefox();
        console.log('\nBuild complete!');
        process.exit(0);
    } catch (error) {
        console.error('Build failed:', error.message);
        process.exit(1);
    }
}

module.exports = { convertToFirefox };
