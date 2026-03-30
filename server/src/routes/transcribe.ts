import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import os from 'os';
import speech from '@google-cloud/speech';
import ffmpeg from 'fluent-ffmpeg';
// @ts-ignore - no types published for this package
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { authenticate } from '../middleware/auth';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const router = Router();
router.use(authenticate);

// 临时存储上传的待识别文件
const upload = multer({ dest: os.tmpdir() });

// Instantiate Google Speech Client
const client = new speech.SpeechClient();

router.post('/', upload.single('audio'), async (req: Request, res: Response): Promise<void> => {
  const file = (req as any).file;
  if (!file) {
    res.status(400).json({ message: 'Missing audio file' });
    return;
  }

  const inputPath = file.path;
  const outputPath = `${inputPath}.wav`;

  try {
    // 1. Convert any audio format to 16000Hz, Mono, LINEAR16 WAV (required for highest accuracy)
    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .audioChannels(1)
        .audioFrequency(16000)
        .audioCodec('pcm_s16le')
        .save(outputPath)
        .on('end', () => resolve())
        .on('error', (err) => reject(err));
    });

    const fileBuffer = fs.readFileSync(outputPath);

    // 2. Call Google Cloud Speech-to-Text API
    // Using simple recognize for now (max 1 minute or 10MB inline)
    // If the file is extremely long, consider warning the user
    const [response] = await client.recognize({
      config: {
        encoding: 'LINEAR16',
        sampleRateHertz: 16000,
        languageCode: 'en-US',
        enableWordTimeOffsets: true,
        enableAutomaticPunctuation: true, // Google can guess punctuation!
      },
      audio: {
        content: fileBuffer.toString('base64'),
      },
    });

    const sentences: Array<{ text: string, startTime: number, endTime: number }> = [];

    // 3. Process words into sentences
    if (response.results) {
      for (const result of response.results) {
        if (!result.alternatives || result.alternatives.length === 0) continue;
        
        const alt = result.alternatives[0];
        const words = alt.words || [];
        
        let currentSentence = [];
        let curStartTime = 0;

        for (const wordInfo of words) {
          const word = wordInfo.word || '';
          const startSecs = Number(wordInfo.startTime?.seconds || 0) + Number(wordInfo.startTime?.nanos || 0) / 1e9;
          const endSecs = Number(wordInfo.endTime?.seconds || 0) + Number(wordInfo.endTime?.nanos || 0) / 1e9;

          if (currentSentence.length === 0) {
            curStartTime = startSecs;
          }

          currentSentence.push(word);

          // If word possesses punctuation, mark as sentence end
          if (word.includes('.') || word.includes('?') || word.includes('!')) {
            sentences.push({
              text: currentSentence.join(' ').trim(),
              startTime: curStartTime,
              endTime: endSecs,
            });
            currentSentence = [];
          }
        }

        // Catch remainder
        if (currentSentence.length > 0) {
          const lastWordInfo = words[words.length - 1];
          const endSecs = Number(lastWordInfo.endTime?.seconds || 0) + Number(lastWordInfo.endTime?.nanos || 0) / 1e9;
          sentences.push({
            text: currentSentence.join(' ').trim(),
            startTime: curStartTime,
            endTime: endSecs,
          });
        }
      }
    }

    res.json({ sentences });
  } catch (error: any) {
    console.error('ASR Error:', error);
    if (error.message?.includes('Sync input too long')) {
      res.status(400).json({ message: '音频超过 1 分钟限制。短视频/微课版暂不接储对象，请上传短于一分钟的音频。' });
    } else {
      res.status(500).json({ message: '语音识别服务异常: ' + error.message });
    }
  } finally {
    // Cleanup Temp files
    if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
  }
});

export default router;
