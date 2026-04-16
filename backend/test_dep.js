import dotenv from 'dotenv';
dotenv.config();

import { detectDependencies, groupDependencies } from './services/dependencyDetector.js';

(async () => {
    try {
        const result = await detectDependencies('facebook', 'react', []);
        console.log("RESULT ECOSYSTEMS LENGTH:", result.ecosystems.length);
        console.log("RESULT TOTAL DEPS:", result.totalDeps);
        const groups = groupDependencies(result.ecosystems);
        console.log("GROUPS:", JSON.stringify(groups, null, 2));
    } catch (e) {
        console.error(e);
    }
})();
