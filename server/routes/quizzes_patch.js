const fs = require('fs');
let code = fs.readFileSync('server/routes/quizzes.js', 'utf8');

const cacheImport = `
const { getCache, setCache } = require('../utils/cache');
`;

const cacheLogic = `
    const isStudent = req.user.role === "student";
    const cacheKey = \`quizzes:\${isStudent}:\${subject}:\${active}:\${page}:\${limit}\`;
    
    const cachedResponse = getCache(cacheKey);
    if (cachedResponse) {
        return res.json(cachedResponse);
    }
`;

const cacheSetLogic = `
    const responsePayload = {
      quizzes,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
    };
    setCache(cacheKey, responsePayload, 60); // cache for 1 min
    res.json(responsePayload);
`;

if (!code.includes("getCache")) {
    code = code.replace("const router = express.Router();", "const router = express.Router();\n" + cacheImport);
    
    // Inject cache check before where condition building
    code = code.replace(
        "const where = {};",
        cacheLogic + "\n    const where = {};"
    );
    
    // Replace json response
    code = code.replace(
        /res\.json\(\{\s*quizzes,\s*totalPages:[^}]+\}\);/g,
        cacheSetLogic
    );
    fs.writeFileSync('server/routes/quizzes.js', code);
    console.log("Quizzes GET cache patched");
}
