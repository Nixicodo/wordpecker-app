import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js/wrapper/ElevenLabsClient';
import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { promisify } from 'util';
import { getUserLanguages } from '../utils/getUserLanguages';

export interface VoiceConfig {
  id: string;
  name: string;
  language: string;
  category: string;
}

export interface AudioGenerationRequest {
  text: string;
  voice?: string;
  language?: string;
  speed?: number;
  userId?: string; // For automatic language detection from user preferences
}

export interface AudioGenerationResponse {
  audioUrl: string;
  cacheKey: string;
  voice: string;
  duration?: number;
}

export interface CachedAudioResponse {
  buffer: Buffer;
  contentType: string;
}

type LocalPronunciationIndexEntry = {
  word: string;
  normalizedWord: string;
  filePath: string;
  fileUrl: string;
  sourceTitle: string;
  bytes?: number;
};

const execFileAsync = promisify(execFile);

export class ElevenLabsService {
  private client?: ElevenLabsClient;
  private readonly backendRoot = path.resolve(__dirname, '../..');
  private cacheDir: string;
  private defaultVoices: Record<string, string> = {
    // High-quality multilingual voices - these work well across languages
    'en': 'pNInz6obpgDQGcFmaJgB', // Adam - English
    'tr': 'EXAVITQu4vr4xnSDxMaL', // Sarah - Turkish
    'es': 'XB0fDUnXU5powFXDhCwa', // Maria - Spanish
    'fr': 'ThT5KcBeYPX3keUQqHPh', // Thomas - French
    'de': 'pFZP5JQG7iQjIQuC4Bku', // Klaus - German
    'it': 'XB0fDUnXU5powFXDhCwa', // Maria - Italian (multilingual)
    'pt': 'pNInz6obpgDQGcFmaJgB', // Adam - Portuguese (multilingual)
    'ru': 'EXAVITQu4vr4xnSDxMaL', // Sarah - Russian (multilingual)
    // Asian languages - will be dynamically updated with native voices
    'ja': 'pNInz6obpgDQGcFmaJgB', // Fallback to Adam (multilingual v2 handles Japanese)
    'ko': 'pNInz6obpgDQGcFmaJgB', // Fallback to Adam (multilingual v2 handles Korean)
    'zh': 'pNInz6obpgDQGcFmaJgB', // Fallback to Adam (multilingual v2 handles Chinese)
    'ar': 'pNInz6obpgDQGcFmaJgB', // Fallback to Adam (multilingual v2 handles Arabic)
    'hi': 'pNInz6obpgDQGcFmaJgB', // Fallback to Adam (multilingual v2 handles Hindi)
    'nl': 'pNInz6obpgDQGcFmaJgB', // Fallback to Adam (multilingual v2 handles Dutch)
    'pl': 'pNInz6obpgDQGcFmaJgB', // Fallback to Adam (multilingual v2 handles Polish)
    'sv': 'pNInz6obpgDQGcFmaJgB', // Fallback to Adam (multilingual v2 handles Swedish)
  };

  private nativeVoiceCache: Map<string, string[]> = new Map();
  private lastVoiceCacheUpdate: number = 0;
  private readonly VOICE_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
  private readonly placeholderApiKeys = new Set([
    '',
    'your_elevenlabs_api_key_here',
    'local-placeholder-key',
    'test-key',
  ]);
  private localPronunciationIndex: LocalPronunciationIndexEntry[] | null = null;
  private readonly localPronunciationIndexPath = path.join(this.backendRoot, 'data', 'pronunciations', 'spanish', 'index.json');

  constructor() {
    const apiKey = process.env.ELEVENLABS_API_KEY?.trim() || '';
    if (this.hasUsableElevenLabsApiKey(apiKey)) {
      this.client = new ElevenLabsClient({
        apiKey,
      });
    } else {
      console.warn('ElevenLabs API key is missing or placeholder; pronunciation will use local fallback when needed.');
    }

    // Create cache directory
    this.cacheDir = path.join(this.backendRoot, 'audio-cache');
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  /**
   * Generate a cache key for audio content
   */
  private generateCacheKey(text: string, voice: string, speed: number): string {
    const content = `${text}-${voice}-${speed}`;
    return crypto.createHash('md5').update(content).digest('hex');
  }

  private normalizeWord(value: string): string {
    return value
      .toLowerCase()
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\p{L}\p{N}]+/gu, '');
  }

  /**
   * Get cached audio file path
   */
  private getCachedFilePath(cacheKey: string, extension: '.mp3' | '.wav'): string {
    return path.join(this.cacheDir, `${cacheKey}${extension}`);
  }

  private hasUsableElevenLabsApiKey(apiKey: string): boolean {
    return !this.placeholderApiKeys.has(apiKey);
  }

  private getContentTypeFromExtension(extension: '.mp3' | '.wav'): string {
    return extension === '.wav' ? 'audio/wav' : 'audio/mpeg';
  }

  private findCachedAudioFile(cacheKey: string): { filePath: string; contentType: string } | null {
    const extensions: Array<'.mp3' | '.wav'> = ['.mp3', '.wav'];

    for (const extension of extensions) {
      const filePath = this.getCachedFilePath(cacheKey, extension);
      if (fs.existsSync(filePath)) {
        return {
          filePath,
          contentType: this.getContentTypeFromExtension(extension),
        };
      }
    }

    return null;
  }

  private getLocalPronunciationIndex(): LocalPronunciationIndexEntry[] {
    if (this.localPronunciationIndex) {
      return this.localPronunciationIndex;
    }

    try {
      if (!fs.existsSync(this.localPronunciationIndexPath)) {
        this.localPronunciationIndex = [];
        return this.localPronunciationIndex;
      }

      const parsed = JSON.parse(fs.readFileSync(this.localPronunciationIndexPath, 'utf8')) as {
        entries?: LocalPronunciationIndexEntry[];
      };

      this.localPronunciationIndex = parsed.entries || [];
      return this.localPronunciationIndex;
    } catch (error) {
      console.error('Failed to load local pronunciation index:', error);
      this.localPronunciationIndex = [];
      return this.localPronunciationIndex;
    }
  }

  private resolveLocalPronunciationPath(text: string, language: string): { filePath: string; contentType: string } | null {
    if (language !== 'es') {
      return null;
    }

    const normalizedText = this.normalizeWord(text);
    if (!normalizedText) {
      return null;
    }

    const match = this.getLocalPronunciationIndex().find((entry) => entry.normalizedWord === normalizedText);
    if (!match) {
      return null;
    }

    const filePath = path.resolve(path.dirname(this.localPronunciationIndexPath), match.filePath);
    if (!fs.existsSync(filePath)) {
      return null;
    }

    const extension = path.extname(filePath).toLowerCase();
    return {
      filePath,
      contentType: extension === '.wav' ? 'audio/wav' : 'audio/mpeg',
    };
  }

  hasLocalSpanishPronunciation(text: string): boolean {
    return Boolean(this.resolveLocalPronunciationPath(text, 'es'));
  }

  /**
   * Check if audio is cached
   */
  private isAudioCached(cacheKey: string): boolean {
    return this.findCachedAudioFile(cacheKey) !== null;
  }

  /**
   * Get native voices for a specific language from cache or API
   */
  private async getNativeVoicesForLanguage(language: string): Promise<string[]> {
    if (!this.client) {
      return [];
    }

    const now = Date.now();
    
    // Check if we have cached voices and cache is still valid
    if (this.nativeVoiceCache.has(language) && 
        (now - this.lastVoiceCacheUpdate) < this.VOICE_CACHE_TTL) {
      return this.nativeVoiceCache.get(language) || [];
    }

    try {
      // Fetch voices from ElevenLabs API
      const voicesResponse = await this.client.voices.getAll();
      const nativeVoices = voicesResponse.voices
        .filter(voice => {
          const voiceLanguage = voice.labels?.language?.toLowerCase();
          const targetLanguage = language.toLowerCase();
          
          // Match exact language or language family
          return voiceLanguage === targetLanguage ||
                 voiceLanguage === this.getLanguageFamily(targetLanguage) ||
                 (targetLanguage === 'zh' && (voiceLanguage === 'chinese' || voiceLanguage === 'mandarin')) ||
                 (targetLanguage === 'ar' && voiceLanguage === 'arabic') ||
                 (targetLanguage === 'ja' && voiceLanguage === 'japanese') ||
                 (targetLanguage === 'ko' && voiceLanguage === 'korean');
        })
        .map(voice => voice.voiceId)
        .slice(0, 5); // Limit to top 5 voices per language

      // Cache the results
      this.nativeVoiceCache.set(language, nativeVoices);
      this.lastVoiceCacheUpdate = now;
      
      return nativeVoices;
    } catch (error) {
      console.warn(`Failed to fetch native voices for ${language}:`, error);
      return [];
    }
  }

  /**
   * Get language family for better voice matching
   */
  private getLanguageFamily(language: string): string {
    const families: Record<string, string> = {
      'zh': 'chinese',
      'ja': 'japanese', 
      'ko': 'korean',
      'ar': 'arabic',
      'hi': 'hindi',
      'es': 'spanish',
      'fr': 'french',
      'de': 'german',
      'it': 'italian',
      'pt': 'portuguese',
      'ru': 'russian',
      'tr': 'turkish',
      'nl': 'dutch',
      'pl': 'polish',
      'sv': 'swedish'
    };
    return families[language] || language;
  }

  /**
   * Get best voice for language with intelligent fallback
   */
  private async getBestVoiceForLanguage(language: string, requestedVoice?: string): Promise<string> {
    // Use explicitly requested voice if provided
    if (requestedVoice) {
      return requestedVoice;
    }

    // Try to get native voices for the language
    const nativeVoices = await this.getNativeVoicesForLanguage(language);
    if (nativeVoices.length > 0) {
      // Use the first (presumably best) native voice
      return nativeVoices[0];
    }

    // Fallback to default voice for the language
    return this.defaultVoices[language] || this.defaultVoices['en'];
  }

  /**
   * Determine the target language for audio generation
   */
  private async determineTargetLanguage(request: AudioGenerationRequest): Promise<string> {
    // If language is explicitly provided, use it
    if (request.language) {
      return request.language;
    }

    // If userId is provided, try to get their target language preference
    if (request.userId) {
      try {
        const userLanguages = await getUserLanguages(request.userId);
        return userLanguages.targetLanguage;
      } catch (error) {
        console.warn(`Failed to get user languages for ${request.userId}:`, error);
      }
    }

    // Default to English
    return 'en';
  }

  /**
   * Get language-specific audio settings for optimal learning
   */
  private getLanguageLearningSettings(language: string, speed?: number): { speed: number; style: number } {
    // Language-specific pronunciation settings optimized for learning
    const languageSettings: Record<string, { speed: number; style: number }> = {
      'ja': { speed: 0.85, style: 0.2 }, // Slower for Japanese phonetics
      'ko': { speed: 0.85, style: 0.2 }, // Slower for Korean pronunciation
      'zh': { speed: 0.8, style: 0.3 },  // Slower for tonal accuracy
      'ar': { speed: 0.85, style: 0.2 }, // Slower for Arabic sounds
      'hi': { speed: 0.85, style: 0.2 }, // Slower for Hindi pronunciation
      'ru': { speed: 0.9, style: 0.1 },  // Slightly slower for Russian
      'th': { speed: 0.85, style: 0.2 }, // Slower for Thai tones
    };

    const defaults = { speed: speed || 1.0, style: 0.0 };
    const langSettings = languageSettings[language];
    
    if (!langSettings) return defaults;

    return {
      speed: speed || langSettings.speed, // Use custom speed if provided
      style: langSettings.style
    };
  }

  /**
   * Generate audio using ElevenLabs API
   */
  async generateAudio(request: AudioGenerationRequest): Promise<AudioGenerationResponse> {
    const { text, voice: requestedVoice, userId } = request;

    // Determine target language (from user preferences or explicit)
    const language = await this.determineTargetLanguage(request);
    
    // Get language-specific settings
    const audioSettings = this.getLanguageLearningSettings(language, request.speed);

    // Validate input
    if (!text || text.trim().length === 0) {
      throw new Error('Text is required for audio generation');
    }

    if (text.length > 2500) {
      throw new Error('Text is too long. Maximum 2500 characters allowed.');
    }

    if (language === 'es') {
      const localPronunciation = this.resolveLocalPronunciationPath(text, language);
      if (localPronunciation) {
        const audioBuffer = fs.readFileSync(localPronunciation.filePath);
        const extension = path.extname(localPronunciation.filePath).toLowerCase() === '.wav' ? '.wav' : '.mp3';
        const cacheKey = this.generateCacheKey(text, 'local-library', audioSettings.speed);
        const filePath = this.getCachedFilePath(cacheKey, extension);
        fs.writeFileSync(filePath, audioBuffer);

        console.log(`Local pronunciation cache hit: ${cacheKey} (${language})`);
        return {
          audioUrl: `/api/audio/cache/${cacheKey}`,
          cacheKey,
          voice: 'local-library',
        };
      }

      throw new Error(`No local Spanish pronunciation found for "${text}".`);
    }

    // Select best voice for the language
    const voice = await this.getBestVoiceForLanguage(language, requestedVoice);
    
    // Generate cache key including language for better cache management
    const cacheKey = this.generateCacheKey(text, voice, audioSettings.speed);

    // Check cache first
    if (this.isAudioCached(cacheKey)) {
      console.log(`Audio served from cache: ${cacheKey} (${language})`);
      return {
        audioUrl: `/api/audio/cache/${cacheKey}`,
        cacheKey,
        voice,
      };
    }

    try {
      if (!this.client) {
        throw new Error('ElevenLabs client is not configured');
      }

      console.log(`Generating ${language} audio: "${text.substring(0, 50)}..." with voice ${voice}`);
      
      // Generate audio using ElevenLabs with language-optimized settings
      const audioResponse = await this.client.textToSpeech.convert(voice, {
        text: text,
        modelId: 'eleven_multilingual_v2', // Supports multiple languages with high quality
        voiceSettings: {
          stability: 0.5,
          similarityBoost: 0.8,
          style: audioSettings.style, // Language-specific style
          useSpeakerBoost: true,
        },
      });

      // Convert response to buffer and save to cache
      const chunks: Uint8Array[] = [];
      const reader = audioResponse.getReader();
      
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      
      const audioBuffer = Buffer.concat(chunks);
      const filePath = this.getCachedFilePath(cacheKey, '.mp3');
      fs.writeFileSync(filePath, audioBuffer);

      console.log(`Audio generated and cached: ${cacheKey} (${language}, ${audioSettings.speed}x speed)`);

      return {
        audioUrl: `/api/audio/cache/${cacheKey}`,
        cacheKey,
        voice,
      };
    } catch (error) {
      console.error('ElevenLabs API error:', error);

      try {
        const fallbackResult = await this.generateLocalAudioFallback(text, language, cacheKey, audioSettings.speed);
        console.log(`Audio generated with local fallback: ${cacheKey} (${language})`);
        return {
          audioUrl: `/api/audio/cache/${cacheKey}`,
          cacheKey,
          voice: fallbackResult.voice,
        };
      } catch (fallbackError) {
        console.error('Local audio fallback error:', fallbackError);
      }

      if (error instanceof Error) {
        const message = error.message.toLowerCase();
        if (message.includes('quota')) {
          throw new Error('Audio generation quota exceeded and local fallback was unavailable.');
        }
        if (message.includes('voice')) {
          throw new Error('Selected voice is not available and local fallback was unavailable.');
        }
        if (message.includes('401') || message.includes('unauthorized')) {
          throw new Error('Pronunciation service authentication failed and local fallback was unavailable.');
        }
      }
      
      throw new Error('Failed to generate audio. Please try again.');
    }
  }

  /**
   * Get available voices for a language
   */
  async getAvailableVoices(language?: string): Promise<VoiceConfig[]> {
    if (!this.client) {
      return [];
    }

    try {
      const voicesResponse = await this.client.voices.getAll();
      
      return voicesResponse.voices
        .filter((voice) => {
          if (!language) return true;
          // Filter by language if specified
          return voice.labels?.language === language;
        })
        .map((voice) => ({
          id: voice.voiceId,
          name: voice.name || 'Unknown Voice',
          language: voice.labels?.language || 'unknown',
          category: voice.category || 'general',
        }))
        .slice(0, 20); // Limit to 20 voices
    } catch (error) {
      console.error('Error fetching voices:', error);
      return [];
    }
  }

  /**
   * Serve cached audio file
   */
  getCachedAudio(cacheKey: string): CachedAudioResponse | null {
    const cachedAudio = this.findCachedAudioFile(cacheKey);

    if (!cachedAudio) {
      return null;
    }

    try {
      return {
        buffer: fs.readFileSync(cachedAudio.filePath),
        contentType: cachedAudio.contentType,
      };
    } catch (error) {
      console.error('Error reading cached audio:', error);
      return null;
    }
  }

  private async generateLocalAudioFallback(
    text: string,
    language: string,
    cacheKey: string,
    speed: number
  ): Promise<{ voice: string }> {
    if (process.platform !== 'win32') {
      throw new Error('Local audio fallback is only available on Windows.');
    }

    const outputPath = this.getCachedFilePath(cacheKey, '.wav');
    const targetCulture = this.mapLanguageToCulture(language);
    const rate = this.mapSpeedToWindowsRate(speed);
    const command = this.buildWindowsTtsCommand(text, outputPath, targetCulture, rate);

    await execFileAsync('powershell', ['-NoProfile', '-EncodedCommand', command], {
      timeout: 30000,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    });

    if (!fs.existsSync(outputPath)) {
      throw new Error('Local TTS did not produce an output file.');
    }

    return {
      voice: `local:${targetCulture}`,
    };
  }

  private mapLanguageToCulture(language: string): string {
    const cultures: Record<string, string> = {
      zh: 'zh-CN',
      en: 'en-US',
      es: 'es-ES',
      fr: 'fr-FR',
      de: 'de-DE',
      it: 'it-IT',
      pt: 'pt-PT',
      ru: 'ru-RU',
      ja: 'ja-JP',
      ko: 'ko-KR',
      ar: 'ar-SA',
      tr: 'tr-TR',
    };

    return cultures[language] || 'en-US';
  }

  private mapSpeedToWindowsRate(speed: number): number {
    const rate = Math.round((speed - 1) * 5);
    return Math.max(-10, Math.min(10, rate));
  }

  private buildWindowsTtsCommand(
    text: string,
    outputPath: string,
    targetCulture: string,
    rate: number
  ): string {
    const encodedText = Buffer.from(text, 'utf8').toString('base64');
    const encodedOutputPath = Buffer.from(outputPath, 'utf8').toString('base64');
    const encodedTargetCulture = Buffer.from(targetCulture, 'utf8').toString('base64');
    const script = `
Add-Type -AssemblyName System.Speech
$text = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${encodedText}'))
$outputPath = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${encodedOutputPath}'))
$targetCulture = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${encodedTargetCulture}'))
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $voices = $synth.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo }
  $selectedVoice = $voices | Where-Object { $_.Culture.Name -like "$targetCulture*" } | Select-Object -First 1
  if (-not $selectedVoice) {
    $selectedVoice = $voices | Where-Object { $_.Culture.Name -like 'en-*' } | Select-Object -First 1
  }
  if ($selectedVoice) {
    $synth.SelectVoice($selectedVoice.Name)
  }
  $synth.Rate = ${rate}
  $synth.SetOutputToWaveFile($outputPath)
  $synth.Speak($text)
}
finally {
  $synth.Dispose()
}
`;

    return Buffer.from(script, 'utf16le').toString('base64');
  }

  /**
   * Clean old cache files (older than 7 days)
   */
  async cleanCache(): Promise<void> {
    try {
      const files = fs.readdirSync(this.cacheDir);
      const now = Date.now();
      const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

      for (const file of files) {
        const filePath = path.join(this.cacheDir, file);
        const stats = fs.statSync(filePath);
        
        if (now - stats.mtime.getTime() > maxAge) {
          fs.unlinkSync(filePath);
          console.log(`Cleaned old cache file: ${file}`);
        }
      }
    } catch (error) {
      console.error('Error cleaning cache:', error);
    }
  }
}

export const elevenLabsService = new ElevenLabsService();
