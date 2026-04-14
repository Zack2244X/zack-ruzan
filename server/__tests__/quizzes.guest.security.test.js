const request = require("supertest");
const app = require("../index");
const Quiz = require("../models/Quiz");
const { clearCache } = require("../utils/cache");

describe("GET /api/quizzes guest security", () => {
  beforeEach(() => {
    clearCache();
    jest.restoreAllMocks();
  });

  test("guest mode never receives correct-answer flags", async () => {
    const quizRow = {
      toJSON: () => ({
        id: 1,
        title: "Quiz",
        subject: "Math",
        isActive: true,
        questions: [
          {
            id: "11111111-1111-1111-1111-111111111111",
            question: "Q1",
            answerOptions: [
              { text: "A", isCorrect: true },
              { text: "B", isCorrect: false },
            ],
          },
        ],
      }),
    };

    const findSpy = jest
      .spyOn(Quiz, "findAndCountAll")
      .mockResolvedValue({ count: 1, rows: [quizRow] });

    const res = await request(app)
      .get("/api/quizzes")
      .set("X-Guest-Mode", "true");

    expect(res.statusCode).toBe(200);
    expect(findSpy).toHaveBeenCalledTimes(1);
    expect(findSpy.mock.calls[0][0].where).toMatchObject({ isActive: true });
    expect(res.body.data[0].questions[0].answerOptions[0]).toEqual({ text: "A" });
    expect(res.body.data[0].questions[0].answerOptions[0]).not.toHaveProperty(
      "isCorrect",
    );
  });

  test("guest response is cached and avoids second DB hit", async () => {
    const quizRow = {
      toJSON: () => ({
        id: 2,
        title: "Quiz 2",
        subject: "Arabic",
        isActive: true,
        questions: [
          {
            id: "22222222-2222-2222-2222-222222222222",
            question: "Q2",
            answerOptions: [{ text: "A", isCorrect: true }],
          },
        ],
      }),
    };

    const findSpy = jest
      .spyOn(Quiz, "findAndCountAll")
      .mockResolvedValue({ count: 1, rows: [quizRow] });

    const req = request(app).get("/api/quizzes").set("X-Guest-Mode", "true");

    const first = await req;
    const second = await request(app)
      .get("/api/quizzes")
      .set("X-Guest-Mode", "true");

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(findSpy).toHaveBeenCalledTimes(1);
  });
});
