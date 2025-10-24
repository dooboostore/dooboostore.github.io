import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

// YouTube Video ID를 여기서 변경하세요
const YOUTUBE_VIDEO_ID = 'PBjQfonkm6Y';

// YouTube URL 생성
const YOUTUBE_URL = `https://www.youtube.com/watch?v=${YOUTUBE_VIDEO_ID}`;

// 출력 디렉토리 설정
const OUTPUT_DIR = path.join(process.cwd(), 'dist-youtube-subtitles');

async function downloadSubtitlesByLanguage(language: string, languageName: string) {
  console.log(`\n� DTownloading ${languageName} subtitles...`);
  console.log('='.repeat(50));

  try {
    // yt-dlp 명령어 구성 (각 언어별로 따로 실행)
    const command = [
      'yt-dlp',
      '--impersonate firefox',
      '--write-auto-subs',
      `--sub-langs "${language}"`,
      '--skip-download',
      '--sleep-subtitles 5',
      `--output "${OUTPUT_DIR}/%(title)s.%(ext)s"`,
      `"${YOUTUBE_URL}"`
    ].join(' ');

    console.log(`🚀 Executing ${languageName} command:`);
    console.log(command);
    console.log('');

    // 명령어 실행
    const { stdout, stderr } = await execAsync(command);

    if (stdout) {
      console.log(`✅ ${languageName} Success Output:`);
      console.log(stdout);
    }

    if (stderr) {
      console.log(`⚠️ ${languageName} Warning/Error Output:`);
      console.log(stderr);
    }

    console.log(`🎉 ${languageName} subtitle download completed!`);

  } catch (error: any) {
    console.error(`❌ Error downloading ${languageName} subtitles:`);
    console.error(error.message);
    
    if (error.stdout) {
      console.log(`📤 ${languageName} Command Output:`);
      console.log(error.stdout);
    }
    
    if (error.stderr) {
      console.log(`📥 ${languageName} Command Error:`);
      console.log(error.stderr);
    }
  }
}

async function downloadAllSubtitles() {
  console.log(`🎥 YouTube Video ID: ${YOUTUBE_VIDEO_ID}`);
  console.log(`🔗 YouTube URL: ${YOUTUBE_URL}`);
  console.log(`📁 Output Directory: ${OUTPUT_DIR}`);

  // 영어 자막 다운로드
  await downloadSubtitlesByLanguage('en', 'English');

  // 잠시 대기
  console.log('\n⏳ Waiting 3 seconds before next download...');
  await new Promise(resolve => setTimeout(resolve, 3000));

  // 한국어 자막 다운로드
  await downloadSubtitlesByLanguage('ko', 'Korean');

  console.log('\n🎊 All subtitle downloads completed!');
  console.log(`📂 Check the subtitles in: ${OUTPUT_DIR}`);
}

// 스크립트 실행
console.log('🎬 YouTube Subtitle Downloader (Separate Languages)');
console.log('==================================================');
downloadAllSubtitles();