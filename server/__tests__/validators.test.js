/**
 * @file Unit tests for request validation middleware chains
 */
process.env.NODE_ENV = "test";

const {
  validate,
  validateGoogleLogin,
  validateCompleteProfile,
  validateCreateAdmin,
  validateCreateQuiz,
  validateUpdateQuiz,
  validateRenameSubject,
  validateSubmitScore,
  validateCreateNote,
  validateUpdateNote,
  validatePagination,
} = require("../middleware/validators");

describe("Validator chains exist and are arrays", () => {
  test("validateGoogleLogin should be an array of validation chains", () => {
    expect(Array.isArray(validateGoogleLogin)).toBe(true);
    expect(validateGoogleLogin.length).toBeGreaterThan(0);
  });

  test("validateCreateQuiz should be an array", () => {
    expect(Array.isArray(validateCreateQuiz)).toBe(true);
    expect(validateCreateQuiz.length).toBeGreaterThan(0);
  });

  test("validateSubmitScore should be an array", () => {
    expect(Array.isArray(validateSubmitScore)).toBe(true);
    expect(validateSubmitScore.length).toBeGreaterThan(0);
  });

  test("validateCreateNote should be an array", () => {
    expect(Array.isArray(validateCreateNote)).toBe(true);
    expect(validateCreateNote.length).toBeGreaterThan(0);
  });

  test("validateCompleteProfile should be an array", () => {
    expect(Array.isArray(validateCompleteProfile)).toBe(true);
    expect(validateCompleteProfile.length).toBeGreaterThan(0);
  });

  test("validatePagination should be an array", () => {
    expect(Array.isArray(validatePagination)).toBe(true);
  });

  test("validate should be a function (middleware)", () => {
    expect(typeof validate).toBe("function");
  });
});

async function runValidators(validators, body) {
  const req = { body, query: {}, params: {}, headers: {}, cookies: {} };
  let statusCode = null;

  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };

  const runMiddleware = async (index) => {
    if (index >= validators.length) return;
    const middleware = validators[index];

    let nextCalled = false;
    await new Promise((resolve, reject) => {
      const next = (err) => {
        if (err) return reject(err);
        nextCalled = true;
        resolve();
      };

      try {
        Promise.resolve(middleware(req, res, next))
          .then(() => {
            if (statusCode !== null || nextCalled) {
              resolve();
            } else {
              // Some middleware can complete synchronously without calling next.
              resolve();
            }
          })
          .catch(reject);
      } catch (err) {
        reject(err);
      }
    });

    if (statusCode === null && nextCalled) {
      await runMiddleware(index + 1);
    }
  };

  await runMiddleware(0);

  return {
    isValid: statusCode === null,
    statusCode,
    payload: res.payload,
  };
}

describe("validateCreateQuiz deep questions validation", () => {
  const validQuestion = {
    question: "What is 2 + 2?",
    answerOptions: [
      { text: "One", isCorrect: false },
      { text: "Two", isCorrect: false },
      { text: "Three", isCorrect: false },
      { text: "Four", isCorrect: true },
    ],
  };

  test("valid quiz should pass validation", async () => {
    const result = await runValidators(validateCreateQuiz, {
      title: "Math Quiz",
      subject: "Math",
      questions: [validQuestion],
    });
    expect(result.isValid).toBe(true);
  });

  test("should reject empty questions array", async () => {
    const result = await runValidators(validateCreateQuiz, {
      title: "Math Quiz",
      subject: "Math",
      questions: [],
    });
    expect(result.isValid).toBe(false);
  });

  test("should reject question with empty text", async () => {
    const result = await runValidators(validateCreateQuiz, {
      title: "Math Quiz",
      subject: "Math",
      questions: [{ ...validQuestion, question: "" }],
    });
    expect(result.isValid).toBe(false);
  });

  test("should reject question with only 1 answer option (< 2)", async () => {
    const result = await runValidators(validateCreateQuiz, {
      title: "Math Quiz",
      subject: "Math",
      questions: [
        {
          ...validQuestion,
          answerOptions: [{ text: "Only one", isCorrect: true }],
        },
      ],
    });
    expect(result.isValid).toBe(false);
  });

  test("should reject question with 7 answer options (> 6)", async () => {
    const result = await runValidators(validateCreateQuiz, {
      title: "Math Quiz",
      subject: "Math",
      questions: [
        {
          ...validQuestion,
          answerOptions: Array.from({ length: 7 }, (_, index) => ({
            text: `Option ${index + 1}`,
            isCorrect: index === 0,
          })),
        },
      ],
    });
    expect(result.isValid).toBe(false);
  });

  test("should reject missing title", async () => {
    const result = await runValidators(validateCreateQuiz, {
      subject: "Math",
      questions: [validQuestion],
    });
    expect(result.isValid).toBe(false);
  });

  test("should reject answer option with empty text", async () => {
    const result = await runValidators(validateCreateQuiz, {
      title: "Math Quiz",
      subject: "Math",
      questions: [
        {
          ...validQuestion,
          answerOptions: [
            { text: "A", isCorrect: false },
            { text: "", isCorrect: true },
            { text: "C", isCorrect: false },
            { text: "D", isCorrect: false },
          ],
        },
      ],
    });
    expect(result.isValid).toBe(false);
  });
});
