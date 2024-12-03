// quizzesHandlers.js

// Firestore database instance is initialized globally in app.js
const { v4: uuidv4 } = require("uuid");
const { FieldValue } = require("firebase-admin/firestore"); // Import FieldValue from firebase-admin/firestore

// Handler to create a new quiz
// Request:
// {
//   "title": "General Knowledge Quiz",
//   "description": "A fun quiz to test your knowledge.",
//   "questions": [
//     {
//       "questionId": "q1",
//       "text": "What is the capital of France?",
//       "type": "multiple-choice",
//       "options": [
//         { "id": "o1", "text": "Paris", "isCorrect": true },
//         { "id": "o2", "text": "London", "isCorrect": false },
//         { "id": "o3", "text": "Berlin", "isCorrect": false },
//         { "id": "o4", "text": "Madrid", "isCorrect": false }
//       ]
//     }
//   ]
// }
// Response:
// {
//   "message": "Quiz created successfully",
//   "quizId": "generated-quiz-id"
// }
exports.createQuiz = async (req, res) => {
  try {
    const { title, description, questions } = req.body; // Extract title, description, and questions from request body
    const quizId = uuidv4(); // Generate a unique ID for the quiz

    // Add new quiz document to 'quizzes' collection in Firestore
    await db.collection("quizzes").doc(quizId).set({
      title,
      description,
      questions,
      createdAt: new Date(), // Add a timestamp for when the quiz was created
    });

    res.status(201).send({ message: "Quiz created successfully", quizId }); // Send success response with quiz ID
  } catch (error) {
    console.error("Error creating quiz:", error); // Log error to console
    res.status(500).send("Internal Server Error"); // Send error response
  }
};

// Handler to fetch all quizzes
// Response:
// [
//   {
//     "quizId": "quiz1",
//     "title": "General Knowledge Quiz",
//     "description": "A fun quiz to test your knowledge."
//   },
//   {
//     "quizId": "quiz2",
//     "title": "Science Trivia",
//     "description": "Test your science knowledge!"
//   }
// ]
exports.getAllQuizzes = async (req, res) => {
  try {
    const quizzesSnapshot = await db.collection("quizzes").get(); // Get all quiz documents from Firestore

    if (quizzesSnapshot.empty) {
      return res.status(404).send({ message: "No quizzes found" }); // Send 404 response if no quizzes are found
    }

    // Map each quiz document to an object containing quizId, title, and description
    const quizzes = quizzesSnapshot.docs.map((doc) => ({
      quizId: doc.id,
      title: doc.data().title,
      description: doc.data().description,
    }));

    res.status(200).send(quizzes); // Send array of quiz objects as response
  } catch (error) {
    console.error("Error fetching quizzes:", error); // Log error to console
    res.status(500).send("Internal Server Error"); // Send error response
  }
};

// Handler to fetch a specific quiz by ID
// Response:
// {
//   "title": "General Knowledge Quiz",
//   "description": "A fun quiz to test your knowledge.",
//   "questions": [
//     {
//       "questionId": "q1",
//       "text": "What is the capital of France?",
//       "type": "multiple-choice",
//       "options": [
//         { "id": "o1", "text": "Paris", "isCorrect": true },
//         { "id": "o2", "text": "London", "isCorrect": false },
//         { "id": "o3", "text": "Berlin", "isCorrect": false },
//         { "id": "o4", "text": "Madrid", "isCorrect": false }
//       ]
//     }
//   ]
// }
exports.getQuizById = async (req, res) => {
  try {
    const quizId = req.params.quizId; // Extract quiz ID from URL parameters
    const quizDoc = await db.collection("quizzes").doc(quizId).get(); // Get quiz document from Firestore

    if (!quizDoc.exists) {
      return res.status(404).send({ message: "Quiz not found" }); // Send 404 response if quiz is not found
    }

    res.status(200).send(quizDoc.data()); // Send quiz data as response
  } catch (error) {
    console.error("Error fetching quiz:", error); // Log error to console
    res.status(500).send("Internal Server Error"); // Send error response
  }
};

// Handler to submit quiz answers
// Request:
// {
//   "userId": "user123",
//   "answers": [
//     { "questionId": "q1", "selectedOptionId": "o1" },
//     { "questionId": "q2", "selectedOptionId": "o2" }
//   ]
// }
// Response:
// {
//   "message": "Quiz answers submitted successfully",
//   "score": 80
// }
exports.submitQuizAnswers = async (req, res) => {
  try {
    const quizId = req.params.quizId; // Extract quiz ID from URL parameters
    const { userId, answers } = req.body; // Extract user ID and answers from request body

    // Validate the answers and calculate the score (implementation depends on your quiz structure)
    const score = await calculateScore(answers, quizId);

    // Add the result to the 'results' collection in Firestore
    await db.collection("results").add({
      quizId,
      userId,
      answers,
      score,
      submittedAt: new Date(), // Add a timestamp for when the answers were submitted
    });

    // Update the user's document to add the quiz history to the 'quizzesTaken' field
    const userRef = db.collection("users").doc(userId);
    await userRef.update({
      quizzesTaken: FieldValue.arrayUnion({
        quizId,
        score,
        completedAt: new Date(), // Add a timestamp for when the quiz was completed
      }),
    });

    res
      .status(200)
      .send({ message: "Quiz answers submitted successfully", score }); // Send success response with score
  } catch (error) {
    console.error("Error submitting quiz answers:", error); // Log error to console
    res.status(500).send("Internal Server Error"); // Send error response
  }
};

// Handler to fetch leaderboard
exports.getQuizLeaderboard = async (req, res) => {
  try {
    // Fetch all user documents from the 'users' collection
    const usersSnapshot = await db.collection("users").get();

    if (usersSnapshot.empty) {
      return res.status(404).send({ message: "No users found" }); // Send 404 response if no users are found
    }

    // Aggregate scores by userId from the 'quizzesTaken' field
    const userScores = {};
    usersSnapshot.docs.forEach((doc) => {
      const data = doc.data();
      const { quizzesTaken } = data;

      if (quizzesTaken && quizzesTaken.length > 0) {
        const userId = doc.id;
        if (!userScores[userId]) {
          userScores[userId] = { totalScore: 0, quizzesTaken: 0 };
        }

        quizzesTaken.forEach((quiz) => {
          userScores[userId].totalScore += quiz.score;
          userScores[userId].quizzesTaken += 1;
        });
      }
    });

    // Convert the aggregated scores to an array and sort by totalScore in descending order
    const leaderboard = Object.keys(userScores)
      .map((userId) => ({
        userId,
        totalScore: userScores[userId].totalScore,
        quizzesTaken: userScores[userId].quizzesTaken,
      }))
      .sort((a, b) => b.totalScore - a.totalScore);

    // Add index to each user in the leaderboard
    const indexedLeaderboard = leaderboard.map((user, index) => ({
      rank: index + 1,
      ...user,
    }));

    res.status(200).send(indexedLeaderboard); // Send array of indexed leaderboard objects as response
  } catch (error) {
    console.error("Error fetching quiz leaderboard:", error); // Log error to console
    res.status(500).send("Internal Server Error"); // Send error response
  }
};

// Helper function to calculate the score (implementation depends on your quiz structure)
async function calculateScore(answers, quizId) {
  let score = 0;
  // Fetch the quiz questions from Firestore
  const quizDoc = await db.collection("quizzes").doc(quizId).get();
  const questions = quizDoc.data().questions;

  // Iterate over the answers and calculate the score
  answers.forEach((answer) => {
    const question = questions.find((q) => q.questionId === answer.questionId);
    if (question) {
      const correctOption = question.options.find((option) => option.isCorrect);
      if (correctOption && correctOption.id === answer.selectedOptionId) {
        score += 1; // Increment score for each correct answer
      }
    }
  });

  return score; // Return the calculated score
}
