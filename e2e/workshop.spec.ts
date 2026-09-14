import { test, expect, type Page } from '@playwright/test'
import { starterCircuit } from '../src/core/circuit'
import { STORAGE_KEY } from '../src/core/storage'
import { solution } from '../tests/solutions'

const legacy = {
  version: 1,
  activeLevel: 6,
  sandbox: { name: '旧沙盒', circuit: starterCircuit() },
  drafts: { '6': solution(6) },
  completed: [1, 2, 3, 4, 5, 6],
  works: [{ id: 'old-work', name: '旧半加器', circuit: solution(6), savedAt: '2026-09-14T12:00:00Z' }],
  motion: false,
}

async function openLevel(page: Page, title: string) {
  await page.getByRole('button', { name: /挑战关卡/ }).click()
  await page.locator('.level-card').filter({ hasText: title }).click()
}
async function selectedId(page: Page) {
  return (await page.locator('.node-selected').getAttribute('data-node'))!
}
async function connect(page: Page, from: string, to: string, pin = 0, fromPin = 0) {
  await page
    .locator(`[data-pin-node="${from}"][data-output="true"][data-pin-index="${fromPin}"]`)
    .press('Enter')
  await page.locator(`[data-pin-node="${to}"][data-output="false"][data-pin-index="${pin}"]`).press('Enter')
}
async function place(page: Page, id: string, x: number, y: number) {
  const points = await page.locator(`[data-node="${id}"]`).evaluate(
    (element, target) => {
      const node = element as unknown as SVGGraphicsElement
      const matrix = node.getScreenCTM()!
      const start = new DOMPoint(25, 20).matrixTransform(matrix)
      const position = node.transform.baseVal.getItem(0).matrix
      return {
        x: start.x,
        y: start.y,
        endX: start.x + (target.x - position.e) * matrix.a,
        endY: start.y + (target.y - position.f) * matrix.d,
      }
    },
    { x, y },
  )
  await page.mouse.move(points.x, points.y)
  await page.mouse.down()
  await page.mouse.move(points.endX, points.endY, { steps: 6 })
  await page.mouse.up()
}

test('legacy half-adder → package → duplicate chips → full-adder → export and restore', async ({
  page,
}, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.addInitScript(
    ({ key, state }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(state))
    },
    { key: STORAGE_KEY, state: legacy },
  )
  await page.goto('/')
  await expect(page.locator('.nav-count')).toHaveText('6/8')
  await expect(page.locator('.circuit-title')).toContainText('第一台加法器')
  await page.getByRole('button', { name: '封装当前电路' }).click()
  await expect(page.locator('.package-ports')).toContainText('输出：S / C')
  await expect(page.locator('.package-truth tbody tr')).toHaveCount(4)
  await page.getByRole('button', { name: '加入芯片库' }).click()
  await expect(page.getByRole('button', { name: '添加芯片 半加器', exact: true })).toBeDisabled()
  await openLevel(page, '把进位接下去')
  await page.getByRole('button', { name: '添加芯片 半加器', exact: true }).click()
  const half1 = await selectedId(page)
  await place(page, half1, 320, 144)
  await page.locator(`[data-node="${half1}"]`).press('Control+d')
  const half2 = await selectedId(page)
  expect(half2).not.toBe(half1)
  await place(page, half2, 480, 336)
  await page.getByRole('button', { name: '全部', exact: true }).click()
  await page.getByRole('button', { name: '添加或门', exact: true }).click()
  const or = await selectedId(page)
  await place(page, or, 480, 144)
  await connect(page, 'port-in-A', half1)
  await connect(page, 'port-in-B', half1, 1)
  await connect(page, half1, half2)
  await connect(page, 'port-in-Cin', half2, 1)
  await connect(page, half2, 'port-out-S')
  await connect(page, half1, or, 0, 1)
  // Pointer dragging exercises the second output pin independently of keyboard connections.
  const from = await page
    .locator(`[data-pin-node="${half2}"][data-output="true"][data-pin-index="1"]`)
    .boundingBox()
  const to = await page
    .locator(`[data-pin-node="${or}"][data-output="false"][data-pin-index="1"]`)
    .boundingBox()
  expect(from).toBeTruthy()
  expect(to).toBeTruthy()
  // The caption expands the group box; the circle itself is the actual pin center.
  const start = await page
    .locator(`[data-pin-node="${half2}"][data-output="true"][data-pin-index="1"] .pin-ring`)
    .boundingBox()
  const end = await page
    .locator(`[data-pin-node="${or}"][data-output="false"][data-pin-index="1"] .pin-ring`)
    .boundingBox()
  await page.mouse.move(start!.x + start!.width / 2, start!.y + start!.height / 2)
  await page.mouse.down()
  await page.mouse.move(end!.x + end!.width / 2, end!.y + end!.height / 2, { steps: 8 })
  await page.mouse.up()
  await connect(page, or, 'port-out-Cout')
  await page.getByRole('button', { name: /验证电路/ }).click()
  await expect(page.getByRole('dialog')).toContainText('8 组输入全部通过')
  await page.getByRole('button', { name: '封装成芯片', exact: true }).click()
  await page.getByRole('button', { name: '加入芯片库' }).click()
  await expect(page.locator('.nav-count')).toHaveText('7/8')
  await page.reload()
  await expect(page.locator('.nav-count')).toHaveText('7/8')
  await expect(page.getByRole('button', { name: '添加芯片 全加器', exact: true })).toBeVisible()
  await page.getByRole('button', { name: /验证电路/ }).click()
  await expect(page.getByRole('dialog')).toContainText('8 组输入全部通过')
  await page.getByRole('button', { name: '关闭对话框' }).click()
  await page.screenshot({ path: testInfo.outputPath('full-adder.png') })
  // Removing a library entry cannot invalidate placed instances.
  await page.getByRole('button', { name: '移除芯片 半加器', exact: true }).click()
  await page.getByRole('button', { name: '移除芯片', exact: true }).click()
  await page.getByRole('button', { name: /验证电路/ }).click()
  await expect(page.getByRole('dialog')).toContainText('8 组输入全部通过')
  await page.getByRole('button', { name: '关闭对话框' }).click()
  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出', exact: true }).click()
  const download = await downloadEvent
  const file = testInfo.outputPath('full-adder.bitcraft.json')
  await download.saveAs(file)
  await page.getByLabel('导入电路作品').setInputFiles(file)
  await expect(page.locator('.workspace-tag')).toHaveText('SANDBOX')
  await page.getByRole('button', { name: '切换开关 A', exact: true }).click()
  await page.getByRole('button', { name: '切换开关 B', exact: true }).click()
  await page.getByRole('button', { name: '切换开关 Cin', exact: true }).click()
  await expect(page.locator('[data-node="port-out-S"] .node-signal')).toHaveText('1')
  await expect(page.locator('[data-node="port-out-Cout"] .node-signal')).toHaveText('1')
  await page.locator(`[data-node="${half1}"]`).press('Enter')
  await page.getByRole('button', { name: '收藏这块芯片', exact: true }).click()
  await expect(page.getByRole('button', { name: '添加芯片 半加器', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '我的作品', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('旧半加器')
  expect(errors).toEqual([])
})

test('packaging errors, invalid import protection and a narrow desktop layout', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 900, height: 720 })
  await page.goto('/')
  await openLevel(page, '反向指示灯')
  await page.getByRole('button', { name: '封装当前电路' }).click()
  await expect(page.locator('.package-error')).toContainText('未接通')
  await expect(page.getByRole('button', { name: '加入芯片库' })).toBeDisabled()
  await page.getByRole('button', { name: '继续搭建', exact: true }).click()
  const before = await page.locator('[data-node]').count()
  await page
    .getByLabel('导入电路作品')
    .setInputFiles({
      name: 'bad.bitcraft.json',
      mimeType: 'application/json',
      buffer: Buffer.from(
        JSON.stringify({
          format: 'bitcraft-circuit',
          version: 2,
          name: '坏芯片',
          circuit: {
            nodes: [
              {
                ...starterCircuit().nodes[0],
                kind: 'CHIP',
                chip: { name: 'bad', inputs: ['A'], outputs: ['Y'], table: [[1]] },
              },
            ],
            wires: [],
          },
        }),
      ),
    })
  await expect(page.getByRole('status')).toContainText('导入失败')
  await expect(page.locator('[data-node]')).toHaveCount(before)
  const geometry = await page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
    packageBottom: document.querySelector('.package-button')!.getBoundingClientRect().bottom,
  }))
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.width)
  expect(geometry.scrollHeight).toBeLessThanOrEqual(geometry.height)
  expect(geometry.packageBottom).toBeLessThan(geometry.height)
  await page.screenshot({ path: testInfo.outputPath('narrow-workshop.png') })
})

test('builds a selector through the UI and checks all eight cases', async ({ page }) => {
  await page.goto('/')
  await openLevel(page, '信号分岔口')
  const gates: string[] = []
  for (const [name, x, y] of [
    ['添加非门', 288, 416],
    ['添加与门', 320, 128],
    ['添加与门', 480, 336],
    ['添加或门', 512, 160],
  ] as const) {
    await page.getByRole('button', { name, exact: true }).click()
    const id = await selectedId(page)
    gates.push(id)
    await place(page, id, x, y)
  }
  const [not, a, b, or] = gates
  await connect(page, 'port-in-Sel', not)
  await connect(page, 'port-in-A', a)
  await connect(page, not, a, 1)
  await connect(page, 'port-in-B', b)
  await connect(page, 'port-in-Sel', b, 1)
  await connect(page, a, or)
  await connect(page, b, or, 1)
  await connect(page, or, 'port-out-Y')
  await page.getByRole('button', { name: /验证电路/ }).click()
  await expect(page.getByRole('dialog')).toContainText('8 组输入全部通过')
})
