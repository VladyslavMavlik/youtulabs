import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import * as kv from "./kv_store.tsx";
import { createClient } from "jsr:@supabase/supabase-js@2";

const app = new Hono();

// Enable logger
app.use('*', logger(console.log));

// Enable CORS for all routes and methods
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// Health check endpoint
app.get("/make-server-7f10f791/health", (c) => {
  return c.json({ status: "ok" });
});

// Get user balance
app.get("/make-server-7f10f791/balance", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    if (error || !user) {
      console.error('Authorization error while getting balance:', error);
      return c.json({ error: 'Unauthorized' }, 401);
    }

    let balance = await kv.get(`user:${user.id}:balance`);
    
    // Initialize balance if not exists (new user gets 100 credits)
    if (balance === null || balance === undefined) {
      balance = 100;
      await kv.set(`user:${user.id}:balance`, balance);
    }
    
    return c.json({ balance: balance || 0 });
  } catch (error) {
    console.error('Error fetching balance:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Generate story
app.post("/make-server-7f10f791/generate", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) {
      return c.json({ error: 'Please login to generate stories' }, 401);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    if (error || !user) {
      console.error('Authorization error while generating story:', error);
      return c.json({ error: 'Unauthorized' }, 401);
    }

    // Check balance
    const balance = await kv.get(`user:${user.id}:balance`) || 0;
    if (balance < 1) {
      return c.json({ error: 'Insufficient credits' }, 403);
    }

    const body = await c.req.json();
    
    // Simulate story generation (replace with actual API call)
    // This is a placeholder - you would integrate with your actual story generation API here
    const mockResults = {
      story: generateMockStory(body),
      titles: generateMockTitles(body),
      synopsis: generateMockSynopsis(body),
      quality: generateMockQualityReport(body.audioMode),
    };

    // Deduct 1 credit
    await kv.set(`user:${user.id}:balance`, balance - 1);

    return c.json(mockResults);
  } catch (error) {
    console.error('Error generating story:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Helper functions to generate mock data
function generateMockStory(params: any): string {
  return `In the realm of ${params.genre}, a tale unfolds in ${params.storyLanguage}.\n\nThe story begins with a mysterious atmosphere, setting the stage for what's to come. Characters emerge from the shadows, each with their own motivations and secrets.\n\nAs the narrative progresses, tensions rise and conflicts emerge. The protagonist faces challenges that test their resolve and character. Unexpected twists keep the reader engaged.\n\nIn the climactic moments, all threads come together. Revelations are made, and the true nature of the conflict becomes clear.\n\nThe story concludes with a resolution that reflects the journey undertaken, leaving a lasting impression on the reader.`;
}

function generateMockTitles(params: any): string[] {
  return [
    `The ${params.genre} Chronicles`,
    `Echoes of Destiny`,
    `Beyond the Veil`,
    `Whispers in the Dark`,
    `The Last Frontier`,
  ];
}

function generateMockSynopsis(params: any): string {
  return `A captivating ${params.genre} tale that explores the depths of human nature. Through compelling characters and intricate plot developments, this story weaves together themes of courage, redemption, and the eternal struggle between light and darkness. Set against a richly detailed backdrop, the narrative unfolds with emotional depth and dramatic intensity, leaving readers spellbound until the final page.`;
}

function generateMockQualityReport(audioMode: boolean) {
  const baseReport = {
    overall: 'good' as const,
    wordCount: {
      actual: 850,
      target: 900,
    },
    repetitionRate: 1.2,
    pacing: {
      good: true,
      issues: 0,
    },
  };

  if (audioMode) {
    return {
      ...baseReport,
      audioMetrics: {
        sentenceLength: 18,
        beatCompliance: 75,
        transitions: {
          count: 12,
          density: 1.4,
        },
        dialogueAttribution: 68,
      },
    };
  }

  return baseReport;
}

Deno.serve(app.fetch);