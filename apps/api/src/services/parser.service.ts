import fs from 'node:fs';
import path from 'node:path';
import pdf from 'pdf-parse';
import mammoth from 'mammoth';
import * as xlsx from 'xlsx';

export async function extractTextFromFile(filePath: string, originalName: string, mimeType: string): Promise<string> {
  const ext = path.extname(originalName).toLowerCase();
  
  try {
    if (ext === '.pdf' || mimeType === 'application/pdf') {
      const dataBuffer = fs.readFileSync(filePath);
      const pdfData = await pdf(dataBuffer);
      return pdfData.text.trim();
    }

    if (ext === '.docx' || mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const result = await mammoth.extractRawText({ path: filePath });
      return result.value.trim();
    }

    if (ext === '.xlsx' || ext === '.xls' || ext === '.csv') {
      const workbook = xlsx.readFile(filePath);
      let fullText = '';
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const csv = xlsx.utils.sheet_to_csv(sheet);
        fullText += `[Sheet: ${sheetName}]\n${csv}\n\n`;
      }
      return fullText.trim();
    }

    // Default text formats: txt, md, json, js, ts, py, html, css, etc.
    const text = fs.readFileSync(filePath, 'utf-8');
    return text.trim();
  } catch (error: any) {
    console.error(`[Parser] Failed to extract text from ${originalName}:`, error.message);
    return `[文档解析警告: 未能成功提取文本内容 (${error.message})]`;
  }
}
