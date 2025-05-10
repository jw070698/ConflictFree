// Gottman conflict types definition
const GOTTMAN_TYPES = {
  CONFLICT_AVOIDER: 'Conflict Avoider',
  VOLATILE: 'Volatile',
  VALIDATING: 'Validating',
  HOSTILE: 'Hostile',
  HOSTILE_DETACHED: 'Hostile-Detached'
};

// Conflict type analysis function
export function analyzeGottmanType(scores) {
  try {
    console.log("analyzeGottmanType received scores:", scores);
    
    // Ensure scores is an array and has the right length
    if (!Array.isArray(scores)) {
      console.error("Scores is not an array:", scores);
      scores = Array(13).fill(3); // Default scores
    }
    
    if (scores.length !== 13) {
      console.warn(`Expected 13 scores but got ${scores.length}, adjusting...`);
      // If too short, pad with default values
      if (scores.length < 13) {
        scores = [...scores, ...Array(13 - scores.length).fill(3)];
      } 
      // If too long, truncate
      else if (scores.length > 13) {
        scores = scores.slice(0, 13);
      }
    }
    
    // Make sure all values are numbers between 1-5
    scores = scores.map(score => {
      const num = Number(score);
      if (isNaN(num)) return 3;
      return Math.max(1, Math.min(5, num));
    });
    
    console.log("Normalized scores for analysis:", scores);
    
    // Calculate scores by question group
    const avoidanceScore = (scores[5] + scores[10] + (6 - scores[6]) + (6 - scores[7]) + (6 - scores[8])) / 5;
    const volatileScore = (scores[6] + scores[7] + scores[11]) / 3;
    const validatingScore = (scores[0] + scores[1] + scores[2] + scores[3] + scores[4]) / 5;
    const hostileScore = (scores[9] + scores[6] + scores[8]) / 3;
    const hostileDetachedScore = (scores[7] + scores[8] + (6 - scores[10])) / 3;
    
    console.log("Calculated type scores:", {
      avoidanceScore,
      volatileScore,
      validatingScore, 
      hostileScore,
      hostileDetachedScore
    });
    
    // Determine the type with the highest score
    const scores_map = {
      [GOTTMAN_TYPES.CONFLICT_AVOIDER]: avoidanceScore,
      [GOTTMAN_TYPES.VOLATILE]: volatileScore,
      [GOTTMAN_TYPES.VALIDATING]: validatingScore,
      [GOTTMAN_TYPES.HOSTILE]: hostileScore,
      [GOTTMAN_TYPES.HOSTILE_DETACHED]: hostileDetachedScore
    };
    
    // Find the type with the highest score
    const primaryType = Object.entries(scores_map)
      .sort((a, b) => b[1] - a[1])[0][0];
    
    console.log("Selected primary type:", primaryType);
    
    // Define characteristics and patterns
    const typeInfo = {
      [GOTTMAN_TYPES.CONFLICT_AVOIDER]: {
        negativePatterns: [
          "Tendency to avoid conflict",
          "Does not express needs clearly",
          "Limited emotional expression"
        ],
        strengths: [
          "Maintains peaceful relationships",
          "Focuses on common ground",
          "Respects individual independence"
        ],
        suggestions: [
          "Express needs more clearly",
          "Try to resolve even small conflicts through conversation",
          "Express emotions more openly"
        ]
      },
      [GOTTMAN_TYPES.VOLATILE]: {
        negativePatterns: [
          "Very intense emotional expression",
          "Immediate persuasion attempts during conflict",
          "Enjoys debate and argument"
        ],
        strengths: [
          "Expresses emotions honestly",
          "Passionate communication style",
          "Uses humor to reduce tension"
        ],
        suggestions: [
          "Recognize when you might be overwhelming your partner",
          "Sometimes step back and just listen to your partner's opinions",
          "Pay more attention to emotional regulation"
        ]
      },
      [GOTTMAN_TYPES.VALIDATING]: {
        negativePatterns: [
          "Only confronts conflicts on certain topics",
          "Can become competitive on specific issues",
          "May limit emotional expression"
        ],
        strengths: [
          "Calm and peaceful interactions",
          "Supports and understands partner's perspective",
          "Excellent at compromise"
        ],
        suggestions: [
          "Try honest conversations on more topics",
          "Express emotions more freely",
          "Find compromise quickly in competitive situations"
        ]
      },
      [GOTTMAN_TYPES.HOSTILE]: {
        negativePatterns: [
          "High levels of defensiveness",
          "Frequent criticism and blame",
          "Repeatedly asserts own perspective only"
        ],
        strengths: [
          "Honest expression of opinions",
          "Not afraid to face problems",
          "Less emotional suppression"
        ],
        suggestions: [
          "Reduce critical expressions (avoid words like 'always', 'never')",
          "Show understanding and support for partner's perspective",
          "Recognize and improve defensive attitudes"
        ]
      },
      [GOTTMAN_TYPES.HOSTILE_DETACHED]: {
        negativePatterns: [
          "Emotional detachment and resignation during conflicts",
          "Frustrating standoffs without resolution",
          "Poor regulation of negative emotions"
        ],
        strengths: [
          "Has strong personal opinions",
          "Doesn't hide problems",
          "Honest emotional expression"
        ],
        suggestions: [
          "Recognize emotional detachment and try to reconnect",
          "Establish concrete steps for conflict resolution",
          "Take breaks from negative interaction patterns"
        ]
      }
    };
    
    return {
      primaryType,
      ...typeInfo[primaryType]
    };
  } catch (error) {
    console.error("Error in analyzeGottmanType:", error);
    // Return default Validator type if there's an error
    return {
      primaryType: GOTTMAN_TYPES.VALIDATING,
      negativePatterns: [
        "Only confronts conflicts on certain topics",
        "Can become competitive on specific issues",
        "May limit emotional expression"
      ],
      strengths: [
        "Calm and peaceful interactions",
        "Supports and understands partner's perspective",
        "Excellent at compromise"
      ],
      suggestions: [
        "Try honest conversations on more topics",
        "Express emotions more freely",
        "Find compromise quickly in competitive situations"
      ]
    };
  }
}

// Analysis function that combines all methods
export function analyzeConflictTypes(personalityAnalysis) {
  try {
    console.log("Starting analyzeConflictTypes with data:", personalityAnalysis);
    
    // Separate the two people (Me and partner)
    const people = Object.entries(personalityAnalysis).map(([person, data]) => ({
      person,
      scores: data.scores || []
    }));
    
    console.log("Extracted people data:", people);
    
    if (people.length < 2) {
      console.error("Not enough people data for analysis");
      throw new Error("At least two people's data is needed for analysis");
    }
    
    // Analyze each person's conflict type
    const peopleAnalysis = {};
    people.forEach(person => {
      console.log(`Analyzing ${person.person}'s conflict type with scores:`, person.scores);
      peopleAnalysis[person.person] = analyzeGottmanType(person.scores);
      console.log(`Analysis result for ${person.person}:`, peopleAnalysis[person.person]);
    });
    return peopleAnalysis;
  } catch (error) {
    console.error("Error during conflict type analysis:", error);
    return null;
  }
}