import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import os from 'os';
import speech from '@google-cloud/speech';
import ffmpeg from 'fluent-ffmpeg';
import jwt from 'jsonwebtoken';
// @ts-ignore - no types published for this package
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import dotenv from 'dotenv';

dotenv.config();

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const app = express();

// Middleware
app.use(cors()); // Allow cross-origin requests from teacher-web
app.use(express.json());

// JWT Auth Middleware
export interface AuthPayload {
  id: string;
  role: 'teacher' | 'student';
}

const authenticate = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ message: '未授权，缺少 Token' });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET!) as AuthPayload;
    // @ts-ignore
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ message: 'Token 无效或已过期' });
  }
};

// Instantiate Google Speech Client
const speechConfig: any = {};
if (process.env.GOOGLE_CREDENTIALS_JSON) {
  try {
    speechConfig.credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
  } catch (err) {
    console.warn("Failed to parse GOOGLE_CREDENTIALS_JSON:", err);
  }
}
const client = new speech.SpeechClient(speechConfig);

// Multer Setup
const upload = multer({ dest: os.tmpdir() });

// Endpoint
app.post('/api/transcribe', authenticate, upload.single('audio'), async (req: Request, res: Response): Promise<void> => {
  const file = (req as any).file;
  if (!file) {
    res.status(400).json({ message: 'Missing audio file' });
    return;
  }

  // Create isolated temp directory for this request's chunks
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'transcribe-'));
  const inputPath = file.path;
  const convertedPath = path.join(tempDir, 'full.wav');
  const chunkPattern = path.join(tempDir, 'chunk_%03d.wav');

  try {
    // 1. Convert any audio format to 16000Hz, Mono, LINEAR16 WAV
    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .audioChannels(1)
        .audioFrequency(16000)
        .audioCodec('pcm_s16le')
        .save(convertedPath)
        .on('end', () => resolve())
        .on('error', (err: Error) => reject(err));
    });

    // 2. Segment the converted WAV into 59-second chunks to bypass 60s limit
    await new Promise<void>((resolve, reject) => {
      ffmpeg(convertedPath)
        .outputOptions([
          '-f segment',
          '-segment_time 59',
          '-c copy'
        ])
        .save(chunkPattern)
        .on('end', () => resolve())
        .on('error', (err: Error) => reject(err));
    });

    // Find all chunks
    const chunkFiles = fs.readdirSync(tempDir)
                         .filter(f => f.startsWith('chunk_') && f.endsWith('.wav'))
                         .sort();

    const allSentences: Array<{ text: string, startTime: number, endTime: number }> = [];

    // Process each chunk
    for (let i = 0; i < chunkFiles.length; i++) {
        const chunkPath = path.join(tempDir, chunkFiles[i]);
        const fileBuffer = fs.readFileSync(chunkPath);
        
        // Offset for this chunk in seconds
        const timeOffset = i * 59;

        const [response] = await client.recognize({
          config: {
            encoding: 'LINEAR16',
            sampleRateHertz: 16000,
            languageCode: 'en-US',
            enableWordTimeOffsets: true,
            enableAutomaticPunctuation: true,
          },
          audio: {
            content: fileBuffer.toString('base64'),
          },
        });

        if (response.results) {
          for (const result of response.results) {
            if (!result.alternatives || result.alternatives.length === 0) continue;
            
            const alt = result.alternatives[0];
            const words = alt.words || [];
            
            let currentSentence = [];
            let curStartTime = 0;

            for (const wordInfo of words) {
              const word = wordInfo.word || '';
              // Add chunk offset to local word time
              const startSecs = Number(wordInfo.startTime?.seconds || 0) + Number(wordInfo.startTime?.nanos || 0) / 1e9 + timeOffset;
              const endSecs = Number(wordInfo.endTime?.seconds || 0) + Number(wordInfo.endTime?.nanos || 0) / 1e9 + timeOffset;

              if (currentSentence.length === 0) {
                curStartTime = startSecs;
              }

              currentSentence.push(word);

              // If word possesses punctuation, mark as sentence end
              if (word.includes('.') || word.includes('?') || word.includes('!')) {
                allSentences.push({
                  text: currentSentence.join(' ').trim(),
                  startTime: curStartTime,
                  endTime: endSecs,
                });
                currentSentence = [];
              }
            }

            // Catch remainder if sentence didn't end with punctuation
            if (currentSentence.length > 0) {
              const lastWordInfo = words[words.length - 1];
              const endSecs = Number(lastWordInfo?.endTime?.seconds || 0) + Number(lastWordInfo?.endTime?.nanos || 0) / 1e9 + timeOffset;
              allSentences.push({
                text: currentSentence.join(' ').trim(),
                startTime: curStartTime,
                endTime: endSecs,
              });
            }
          }
        }
    }

    res.json({ sentences: allSentences });
  } catch (error: any) {
    console.error('ASR Chunking Error:', error);
    res.status(500).json({ message: '语音长音频识别服务异常: ' + error.message });
  } finally {
    // Cleanup Temp files
    if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
});

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`Transcriber Microservice running on port ${PORT}`);
});
