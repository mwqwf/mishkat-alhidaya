#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Fix react-native-share-menu SDK versions
const shareMenuBuildGradle = path.join(__dirname, '../node_modules/react-native-share-menu/android/build.gradle');

if (fs.existsSync(shareMenuBuildGradle)) {
    let content = fs.readFileSync(shareMenuBuildGradle, 'utf8');
    
    // Update compileSdkVersion
    content = content.replace(/compileSdkVersion\s+\d+/g, 'compileSdkVersion 34');
    
    // Update buildToolsVersion
    content = content.replace(/buildToolsVersion\s+"[\d.]+"/g, 'buildToolsVersion "34.0.0"');
    
    // Update minSdkVersion
    content = content.replace(/minSdkVersion\s+\d+/g, 'minSdkVersion 24');
    
    // Update targetSdkVersion
    content = content.replace(/targetSdkVersion\s+\d+/g, 'targetSdkVersion 34');
    
    fs.writeFileSync(shareMenuBuildGradle, content);
    console.log('✅ Fixed react-native-share-menu SDK versions');
} else {
    console.log('⚠️  react-native-share-menu build.gradle not found');
}

console.log('📦 Postinstall script completed'); 