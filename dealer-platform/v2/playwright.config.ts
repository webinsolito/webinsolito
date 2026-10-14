import {defineConfig,devices} from '@playwright/test'

export default defineConfig({
  testDir:'./e2e',
  timeout:30_000,
  expect:{timeout:7_000},
  fullyParallel:false,
  workers:1,
  reporter:'list',
  webServer:{command:'npm run dev -- --host 127.0.0.1 --port 4174',url:'http://127.0.0.1:4174',reuseExistingServer:false,timeout:30_000},
  use:{baseURL:'http://127.0.0.1:4174',trace:'retain-on-failure',screenshot:'only-on-failure'},
  projects:[
    {name:'chromium-desktop',use:{...devices['Desktop Chrome']}},
    {name:'iphone-webkit',use:{...devices['iPhone 15 Pro Max']}}
  ]
})
