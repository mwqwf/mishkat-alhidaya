import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

const CACHE_PREFIX = 'cache_';
const CACHE_EXPIRY = 1000 * 60 * 60 * 24; // 24 ساعة

export async function setCache(key, data) {
  const cacheData = {
    data,
    ts: Date.now(),
  };
  await AsyncStorage.setItem(CACHE_PREFIX + key, JSON.stringify(cacheData));
}

export async function getCache(key) {
  const raw = await AsyncStorage.getItem(CACHE_PREFIX + key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed.data;
  } catch {
    return null;
  }
}

export async function clearCache(key) {
  await AsyncStorage.removeItem(CACHE_PREFIX + key);
}

export async function isCacheFresh(key, expiry = CACHE_EXPIRY) {
  const raw = await AsyncStorage.getItem(CACHE_PREFIX + key);
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw);
    return Date.now() - parsed.ts < expiry;
  } catch {
    return false;
  }
}

export async function updateCacheIfOnline(key, fetchFunc) {
  const state = await NetInfo.fetch();
  if (state.isConnected) {
    const data = await fetchFunc();
    await setCache(key, data);
    return data;
  } else {
    return getCache(key);
  }
}

export const getCachedData = async (key) => {
  try {
    const value = await AsyncStorage.getItem(key);
    if (value !== null) {
      return JSON.parse(value);
    }
    return null;
  } catch (e) {
    return null;
  }
};

export const setCachedData = async (key, data) => {
  try {
    await AsyncStorage.setItem(key, JSON.stringify({data, ts: Date.now()}));
  } catch (e) {
    // handle error
  }
};

export const clearCachedData = async (key) => {
  try {
    await AsyncStorage.removeItem(key);
  } catch (e) {
    // handle error
  }
}; 