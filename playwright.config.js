/**
 * playwright.config.js
 * 오늘심박 (HeartTune) — 로컬 / CI / GitHub Pages 원격 배포 환경 겸용 설정
 */
import { defineConfig, devices } from '@playwright/test';

// 깃허브 가상 서버가 현재 구동 중인 저장소 이름에서 'HeartTune' 또는 'HeartTune-test'를 자동으로 추출합니다.
const githubRepo = process.env.GITHUB_REPOSITORY;
const repoName = githubRepo ? githubRepo.split('/')[1] : 'HeartTune-test';

// 로컬에서 서버를 띄워 테스트할지(CI 포함), 배포된 GitHub Pages 실서버를 직접 타격할지 결정합니다.
const useLocalServer = Boolean(process.env.CI || process.env.PW_LOCAL);

export default defineConfig({
  testDir: './tests',
  // Node.js 단위 테스트(dsp.test.js)와 겹치지 않도록 *.spec.js 파일만 E2E로 실행
  testMatch: '**/*.spec.js',
  timeout: 30000,
  expect: {
    timeout: 5000
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // CI 에서는 실패 원인이 Actions 로그에 바로 보이도록 list 리포터를 함께 사용합니다.
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never' }]]
    : 'html',
  use: {
    // CI 환경에서는 로컬 가상 서버(8080)를, 그 외에는 저장소 이름에 맞춘 GitHub Pages 주소를 자동 완성합니다.
    baseURL: useLocalServer
      ? 'http://localhost:8080'
      : `https://zzexxous-pixel.github.io/${repoName}/`,
    trace: 'on-first-retry',
    permissions: ['camera'],
    launchOptions: {
      // 헤드리스 환경에서도 카메라 권한 팝업 및 스트림 에러가 나지 않도록 가짜 미디어 스트림 주입
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream'
      ]
    }
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ],
  webServer: useLocalServer
    ? {
        command: 'npx --yes serve -p 8080 .',
        url: 'http://localhost:8080',
        reuseExistingServer: true,
        timeout: 15000
      }
    : undefined
});