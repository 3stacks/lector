import { test, expect, Page } from "@playwright/test";

const TEST_COLLECTION = "top500";
const TEST_SENTENCE_ID = "test-inline-def-1";

// Seed a cloze sentence where the non-cloze words are in the dictionary
// "die" -> "the" (rank 1 in dictionary)
// "kat" is the cloze word (blanked out)
// "is" -> "is" (rank 4 in dictionary)
const testSentence = {
  id: TEST_SENTENCE_ID,
  sentence: "Die kat is groot.",
  clozeWord: "kat",
  clozeIndex: 1,
  translation: "The cat is big.",
  source: "tatoeba",
  collection: TEST_COLLECTION,
  masteryLevel: 0,
  nextReview: new Date().toISOString(),
  reviewCount: 0,
  timesCorrect: 0,
  timesIncorrect: 0,
};

// Helper: navigate to practice and start a type-mode round
async function startTypeRound(page: Page) {
  await page.goto("/practice");
  await expect(page.getByRole("button", { name: "Start" })).toBeVisible({
    timeout: 30000,
  });

  // Scope to Learn New section to avoid clicking Review Due buttons
  const learnNewSection = page.getByText("Learn New").locator("..");
  await learnNewSection
    .getByRole("button", { name: /Top 500/ })
    .first()
    .click();
  await page.getByRole("button", { name: "10", exact: true }).click();
  await page.getByRole("button", { name: "Type" }).click();
  await page.getByRole("button", { name: "Start" }).click();

  await expect(page.getByText("Fill in the blank")).toBeVisible({
    timeout: 10000,
  });
}

test.describe("Cloze Inline Definitions", () => {
  test.beforeEach(async ({ page }) => {
    // Seed the test sentence
    const res = await page.request.post("http://localhost:3456/api/cloze", {
      data: [testSentence],
    });
    expect(res.ok()).toBeTruthy();
  });

  test.afterEach(async ({ page }) => {
    // Clean up
    await page.request.delete(
      `http://localhost:3456/api/cloze/${TEST_SENTENCE_ID}`
    );
  });

  test("should show translation popup when tapping a word in practicing state", async ({
    page,
  }) => {
    await startTypeRound(page);

    // Find a clickable word (non-cloze word) and click it
    const clozeWords = page.locator('[data-testid="cloze-word"]');
    await expect(clozeWords.first()).toBeVisible();

    // Click the first clickable word
    await clozeWords.first().click();

    // The word definition popup should appear
    const popup = page.locator('[data-testid="word-definition-popup"]');
    await expect(popup).toBeVisible({ timeout: 5000 });

    // Should show an arrow (translation separator)
    await expect(popup.locator("text=\u2192")).toBeVisible();
  });

  test("should show dictionary translation for known words", async ({
    page,
  }) => {
    await startTypeRound(page);

    const clozeWords = page.locator('[data-testid="cloze-word"]');
    await expect(clozeWords.first()).toBeVisible();

    // Click a word
    const wordText = await clozeWords.first().textContent();
    await clozeWords.first().click();

    // Popup should appear with the word we clicked
    const popup = page.locator('[data-testid="word-definition-popup"]');
    await expect(popup).toBeVisible({ timeout: 5000 });

    // The word text should appear in the popup (stripped of punctuation)
    if (wordText) {
      const cleanWord = wordText.replace(/[.,!?;:'")\]]+$/, "");
      await expect(
        popup.getByText(cleanWord, { exact: false })
      ).toBeVisible();
    }
  });

  test("should close the popup when clicking the close button", async ({
    page,
  }) => {
    await startTypeRound(page);

    const clozeWords = page.locator('[data-testid="cloze-word"]');
    await expect(clozeWords.first()).toBeVisible();
    await clozeWords.first().click();

    const popup = page.locator('[data-testid="word-definition-popup"]');
    await expect(popup).toBeVisible({ timeout: 5000 });

    // Close the popup
    await popup.locator('button[title="Close"]').click();
    await expect(popup).not.toBeVisible();
  });

  test("should clear popup when advancing to next sentence", async ({
    page,
  }) => {
    await startTypeRound(page);

    // Click a word to open popup
    const clozeWords = page.locator('[data-testid="cloze-word"]');
    await expect(clozeWords.first()).toBeVisible();
    await clozeWords.first().click();

    const popup = page.locator('[data-testid="word-definition-popup"]');
    await expect(popup).toBeVisible({ timeout: 5000 });

    // Type a wrong answer and submit to get feedback
    const input = page.locator('input[placeholder="..."]');
    await input.fill("zzzzz");
    await input.press("Enter");

    // Wait for feedback
    await expect(
      page.getByRole("heading", { name: "Incorrect" })
    ).toBeVisible({ timeout: 5000 });

    // Click Next Sentence
    await page.getByRole("button", { name: "Next Sentence" }).click();

    // Popup should be cleared on the new sentence
    await page.waitForTimeout(500);
    await expect(popup).not.toBeVisible();
  });

  test("should show clickable words in feedback state too", async ({
    page,
  }) => {
    await startTypeRound(page);

    // Submit a wrong answer to get to feedback state
    const input = page.locator('input[placeholder="..."]');
    await input.fill("zzzzz");
    await input.press("Enter");

    await expect(
      page.getByRole("heading", { name: "Incorrect" })
    ).toBeVisible({ timeout: 5000 });

    // Words in the feedback sentence should be clickable
    const clozeWords = page.locator('[data-testid="cloze-word"]');
    await expect(clozeWords.first()).toBeVisible();

    // Click a word
    await clozeWords.first().click();

    // Popup should appear
    const popup = page.locator('[data-testid="word-definition-popup"]');
    await expect(popup).toBeVisible({ timeout: 5000 });
  });

  test("cloze blank word should not be clickable", async ({ page }) => {
    await startTypeRound(page);

    // The input field (cloze word) should NOT have data-testid="cloze-word"
    const inputField = page.locator('input[placeholder="..."]');
    await expect(inputField).toBeVisible();

    // Verify the input is NOT wrapped in a cloze-word testid
    const clozeWordInput = page.locator(
      '[data-testid="cloze-word"] input[placeholder="..."]'
    );
    await expect(clozeWordInput).not.toBeVisible();
  });
});
