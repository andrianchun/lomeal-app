// src/utils/ai.js

// Function to call Gemini API for food estimation
// Make sure to add VITE_GEMINI_API_KEY to your .env file
export const estimateFoodWithGemini = async (textPrompt, base64Image = null) => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  
  if (!apiKey) {
    throw new Error("Gemini API key is not configured. Please add VITE_GEMINI_API_KEY to your .env file.");
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${apiKey}`;

  let contents = [];

  // If there's an image
  if (base64Image) {
    // base64Image usually looks like data:image/jpeg;base64,...
    const mimeType = base64Image.split(';')[0].split(':')[1];
    const data = base64Image.split(',')[1];
    
    contents.push({
      inlineData: {
        mimeType,
        data
      }
    });
  }

  // Always include the prompt/instructions
  const systemPrompt = `You are a professional nutritionist.
Your task is to analyze the user's input (either text, an image, or both) and return a JSON object estimating the nutritional value.
If it's an image, identify the food first.
The response MUST be valid JSON only, with no markdown formatting.
Schema:
{
  "foodName": "String (Name of the food)",
  "servingSize": "String (e.g., '1 portion', '100g')",
  "kcal": Number (estimated calories),
  "protein": Number (estimated protein in grams),
  "carbs": Number (estimated carbs in grams),
  "fat": Number (estimated fat in grams),
  "confidence": "High" | "Medium" | "Low",
  "notes": "String (Any assumptions made)"
}`;

  contents.push({
    text: systemPrompt + (textPrompt ? `\nUser Input: ${textPrompt}` : '')
  });

  const payload = {
    contents: [{ parts: contents }],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json",
    }
  };

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Gemini API Error:", errorData);
      throw new Error(errorData.error?.message || "Failed to estimate food");
    }

    const data = await response.json();
    const textRes = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!textRes) {
      throw new Error("Unexpected response from Gemini API");
    }

    return JSON.parse(textRes);
  } catch (err) {
    console.error("Error in estimateFoodWithGemini:", err);
    throw err;
  }
};
