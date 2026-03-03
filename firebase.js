// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBis2kx8GE4pRssNUd4Fd0c5q4ylhZlmcA",
  authDomain: "blejendar.firebaseapp.com",
  projectId: "blejendar",
  storageBucket: "blejendar.firebasestorage.app",
  messagingSenderId: "942627651101",
  appId: "1:942627651101:web:56583ba6efbfefc77590f4",
  measurementId: "G-23GY62R2DL"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);