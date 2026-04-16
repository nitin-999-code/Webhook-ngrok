import { performAnalysis } from './controllers/repoController.js';
import dotenv from 'dotenv';
dotenv.config();

(async () => {
  try {
    console.log("starting performAnalysis on facebook/react");
    const result = await performAnalysis("facebook", "react", "https://github.com/facebook/react");
    console.log("Success");
  } catch (err) {
    console.error("FAILED WITH:", err);
  }
})();
