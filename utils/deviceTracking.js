import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { database } from '../config/firebase';
import { ref, set } from 'firebase/database';

// Generate unique device ID based on platform info and timestamp
const generateDeviceId = () => {
  const platform = Platform.OS;
  const version = Platform.Version;
  const timestamp = Date.now();
  const random = Math.random().toString(36).substr(2, 9);
  return `${platform}_${version}_${timestamp}_${random}`;
};

// Register device installation
export const registerDeviceInstallation = async () => {
  try {
    let deviceId = await AsyncStorage.getItem('deviceId');
    let firstInstall = await AsyncStorage.getItem('firstInstall');
    
    // If no device ID exists, this is a new installation
    if (!deviceId) {
      deviceId = generateDeviceId();
      await AsyncStorage.setItem('deviceId', deviceId);
      
      // Set first install date
      const installDate = Date.now().toString();
      await AsyncStorage.setItem('firstInstall', installDate);
      firstInstall = installDate;
      
      console.log('📱 New app installation detected, Device ID:', deviceId);
    }

    // Try to register device in Firebase
    try {
      if (database) {
        const deviceRef = ref(database, `devices/${deviceId}`);
        await set(deviceRef, {
          platform: Platform.OS,
          platformVersion: Platform.Version.toString(),
          lastActive: Date.now(),
          firstInstall: parseInt(firstInstall) || Date.now(),
          isActive: true
        });
        console.log('📱 Device registered successfully in Firebase:', deviceId);
      } else {
        console.log('📱 Firebase not available, device saved locally only');
      }
    } catch (firebaseError) {
      console.log('📱 Firebase error, device saved locally:', firebaseError.message);
    }

    return deviceId;

  } catch (error) {
    console.error("❌ Error registering device installation:", error);
    return null;
  }
};

// Update device activity (for periodic updates)
export const updateDeviceActivity = async () => {
  try {
    const deviceId = await AsyncStorage.getItem('deviceId');
    
    if (deviceId) {
      try {
        if (database) {
          const deviceRef = ref(database, `devices/${deviceId}`);
          await set(deviceRef, {
            platform: Platform.OS,
            platformVersion: Platform.Version.toString(),
            lastActive: Date.now(),
            firstInstall: parseInt(await AsyncStorage.getItem('firstInstall')) || Date.now(),
            isActive: true
          });
        }
      } catch (firebaseError) {
        console.log('📱 Firebase update failed silently:', firebaseError.message);
      }
    }

  } catch (error) {
    console.error("❌ Error updating device activity:", error);
  }
}; 