import { test, expect, Page } from "@playwright/test";

async function waitForSetup(page: Page) {
  await page.goto("/practice");
  await expect(page.getByRole("button", { name: "Start" })).toBeVisible({
    timeout: 30000,
  });
}

async function startTypeRound(page: Page) {
  await waitForSetup(page);
  await page.getByRole("button", { name: "10", exact: true }).click();
  await page.getByRole("button", { name: "Type" }).click();
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.getByText("Fill in the blank")).toBeVisible({
    timeout: 10000,
  });
}

test.describe("MC Fallback from Type Mode", () => {
  test("should show Multiple Choice button in type mode", async ({ page }) => {
    await startTypeRound(page);

    await expect(
      page.getByRole("button", { name: "Multiple Choice" })
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /Hint/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Check" })).toBeVisible();
  });

  test("should switch to MC options when Multiple Choice is clicked", async ({
    page,
  }) => {
    await startTypeRound(page);

    // Should show input field initially
    const input = page.locator('input[placeholder="..."]');
    await expect(input).toBeVisible();

    // Click Multiple Choice
    await page.getByRole("button", { name: "Multiple Choice" }).click();
    await page.waitForTimeout(300);

    // Input should be replaced with blank
    await expect(input).not.toBeVisible();

    // Should now show "Choose the correct word"
    await expect(page.getByText("Choose the correct word")).toBeVisible();

    // Should show MC option buttons
    const mcGrid = page.locator(".grid.grid-cols-1");
    const mcButtons = mcGrid.locator("button");
    await expect(mcButtons.first()).toBeVisible();
  });

  test("should return to type mode after answering MC fallback", async ({
    page,
  }) => {
    await startTypeRound(page);

    // Switch to MC
    await page.getByRole("button", { name: "Multiple Choice" }).click();
    await page.waitForTimeout(300);

    // Answer the MC question
    const mcGrid = page.locator(".grid.grid-cols-1");
    const mcButtons = mcGrid.locator("button");
    await mcButtons.first().click();

    // Wait for auto-advance (MC auto-advances after delay)
    await page.waitForTimeout(2000);

    // Next question should be back in type mode
    const feedbackNext = page.getByRole("button", { name: "Next Sentence" });
    if (await feedbackNext.isVisible().catch(() => false)) {
      await feedbackNext.click();
      await page.waitForTimeout(500);
    }

    // Should be back to type mode (input visible, not MC)
    const input = page.locator('input[placeholder="..."]');
    const fillInBlank = page.getByText("Fill in the blank");

    // Either we see the input (type mode) or we're done
    const isTyping = await input.isVisible().catch(() => false);
    const isFillIn = await fillInBlank.isVisible().catch(() => false);
    const isComplete = await page
      .getByText("Round Complete!")
      .isVisible()
      .catch(() => false);

    expect(isTyping || isFillIn || isComplete).toBe(true);
  });
});

test.describe("Hint Preserves User Input", () => {
  test("should add next letter after correct prefix", async ({ page }) => {
    await startTypeRound(page);

    const input = page.locator('input[placeholder="..."]');
    const hintBtn = page.getByRole("button", { name: /Hint/ });

    // Get first hint letter
    await hintBtn.click();
    await page.waitForTimeout(200);
    const firstLetter = await input.inputValue();
    expect(firstLetter.length).toBe(1);

    // Clear and type the same first letter manually
    await input.clear();
    await input.fill(firstLetter);
    await page.waitForTimeout(100);

    // Click hint - should add the SECOND letter, not replace with first
    await hintBtn.click();
    await page.waitForTimeout(200);
    const afterHint = await input.inputValue();
    expect(afterHint.length).toBe(2);
    expect(afterHint[0]).toBe(firstLetter);
  });

  test("should reset to first letter if user typed wrong prefix", async ({
    page,
  }) => {
    await startTypeRound(page);

    const input = page.locator('input[placeholder="..."]');
    const hintBtn = page.getByRole("button", { name: /Hint/ });

    // Type a wrong character
    await input.fill("zzz");
    await page.waitForTimeout(100);

    // Click hint - should give first letter of correct word (ignoring wrong input)
    await hintBtn.click();
    await page.waitForTimeout(200);
    const afterHint = await input.inputValue();
    // Should be just 1 character (the correct first letter)
    expect(afterHint.length).toBe(1);
    // Should not start with 'z'
    expect(afterHint[0]).not.toBe("z");
  });

  test("should progressively reveal more letters with consecutive hints", async ({
    page,
  }) => {
    await startTypeRound(page);

    const input = page.locator('input[placeholder="..."]');
    const hintBtn = page.getByRole("button", { name: /Hint/ });

    // Click hint 3 times
    await hintBtn.click();
    await page.waitForTimeout(100);
    const len1 = (await input.inputValue()).length;

    await hintBtn.click();
    await page.waitForTimeout(100);
    const len2 = (await input.inputValue()).length;

    await hintBtn.click();
    await page.waitForTimeout(100);
    const len3 = (await input.inputValue()).length;

    // Each hint should reveal one more letter
    expect(len1).toBe(1);
    expect(len2).toBe(2);
    expect(len3).toBe(3);
  });
});
