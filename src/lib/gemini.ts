import { GoogleGenerativeAI } from "@google/generative-ai";
import { db } from "./db";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export async function parseDocumentWithGemini(documentId: string, fileUrl: string) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

    // Fetch the document
    const document = await db.document.findUnique({
      where: { id: documentId },
    });

    if (!document) return;

    // Build prompt based on document type
    let prompt = "";
    
    switch (document.type) {
      case "TRANSCRIPT":
        prompt = `Analyze this academic transcript and extract the following information in JSON format:
        {
          "institution": "name of the institution",
          "studentName": "student's full name",
          "studentId": "student ID if visible",
          "program": "degree/program name",
          "graduationYear": "year of graduation or expected graduation",
          "gpa": "GPA or equivalent score",
          "grades": {
            "subject": "grade"
          },
          "mathGrade": "grade for mathematics/math-related course",
          "englishGrade": "grade for English/language course",
          "scienceGrade": "grade for science course if applicable"
        }
        
        Only return valid JSON, no explanations.`;
        break;

      case "CERTIFICATE":
        prompt = `Analyze this certificate and extract the following information in JSON format:
        {
          "type": "type of certificate",
          "title": "certificate title",
          "issuedTo": "name of the recipient",
          "issuedBy": "issuing organization",
          "issueDate": "date of issue",
          "certificateNumber": "certificate number if visible",
          "validUntil": "expiry date if applicable"
        }
        
        Only return valid JSON, no explanations.`;
        break;

      case "CV":
        prompt = `Analyze this CV/Resume and extract the following information in JSON format:
        {
          "name": "full name",
          "email": "email address",
          "phone": "phone number",
          "location": "city/country",
          "summary": "professional summary if present",
          "education": [
            {
              "institution": "school name",
              "degree": "degree type",
              "field": "field of study",
              "year": "graduation year"
            }
          ],
          "experience": [
            {
              "company": "company name",
              "role": "job title",
              "duration": "time period",
              "description": "brief description"
            }
          ],
          "skills": ["skill1", "skill2"],
          "languages": ["language1", "language2"]
        }
        
        Only return valid JSON, no explanations.`;
        break;

      case "ID_DOCUMENT":
        prompt = `Analyze this ID document and extract the following information in JSON format:
        {
          "documentType": "type of ID",
          "fullName": "full name as shown",
          "idNumber": "ID number",
          "dateOfBirth": "date of birth",
          "nationality": "nationality if shown",
          "issueDate": "date of issue",
          "expiryDate": "expiry date"
        }
        
        Only return valid JSON, no explanations.`;
        break;

      default:
        prompt = `Analyze this document and extract all relevant information in JSON format. Include document type, key details, dates, names, and any other important information.
        
        Only return valid JSON, no explanations.`;
    }

    // In production, you would:
    // 1. Download the file from fileUrl
    // 2. Convert to base64 if it's an image
    // 3. Use Gemini's vision capabilities for images/PDFs
    
    // For now, we'll simulate the response structure
    // In real implementation, use:
    // const result = await model.generateContent([prompt, { inlineData: { mimeType, data: base64 } }]);
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Parse the JSON response
    let parsedData;
    try {
      // Clean the response - remove markdown code blocks if present
      const cleanedText = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsedData = JSON.parse(cleanedText);
    } catch {
      parsedData = { rawText: text };
    }

    // Update document with parsed data
    await db.document.update({
      where: { id: documentId },
      data: {
        parsedData,
        verificationStatus: "VERIFIED",
      },
    });

    // If it's a transcript, update student grades
    if (document.type === "TRANSCRIPT" && parsedData.grades) {
      const student = await db.student.findUnique({
        where: { id: document.studentId },
      });

      if (student) {
        await db.student.update({
          where: { id: student.id },
          data: {
            mathGrade: parsedData.mathGrade || student.mathGrade,
            englishGrade: parsedData.englishGrade || student.englishGrade,
            scienceGrade: parsedData.scienceGrade || student.scienceGrade,
            gpa: parsedData.gpa ? parseFloat(parsedData.gpa) : student.gpa,
          },
        });
      }
    }

    return parsedData;
  } catch (error) {
    console.error("Gemini parsing error:", error);
    
    // Mark document as needing manual review
    await db.document.update({
      where: { id: documentId },
      data: {
        verificationStatus: "PENDING",
        verificationNotes: "Automatic parsing failed, manual review required",
      },
    });

    throw error;
  }
}
