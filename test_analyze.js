import { fetchRepoTree } from './backend/services/githubService.js';
import dotenv from 'dotenv';
dotenv.config({path: './backend/.env'});

(async () => {
  try {
    console.log("fetching tree");
    const data = await fetchRepoTree('facebook', 'react');
    console.log("tree success, length:", data.tree?.length);
  } catch (e) {
    console.error("error:", e.response ? e.response.data : e.message);
  }
})();
