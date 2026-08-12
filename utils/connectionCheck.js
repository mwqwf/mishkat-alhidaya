import { db } from '../config/firebase';
import { collection, getDocs, limit, query } from 'firebase/firestore';

export const checkFirebaseConnection = async () => {
  try {
    const q = query(collection(db, 'books'), limit(1));
    await getDocs(q);
    return true;
  } catch (error) {
    return false;
  }
};
