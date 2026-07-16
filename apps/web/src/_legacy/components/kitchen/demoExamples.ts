/**
 * Pre-loaded demo examples from real Gemini ER 1.6 video extractions.
 *
 * These are actual results from calling the video-to-protocol endpoint
 * against real YouTube cooking videos. Baked into the frontend so demos
 * work without hitting API rate limits.
 */

export interface DemoExample {
  id: string;
  title: string;
  videoUrl: string;
  thumbnailEmoji: string;
  extractedAt: string;
  latencyMs: number;
  protocol: {
    id: string;
    name: string;
    description: string;
    difficulty: string;
    estimatedMinutes: number;
    tags: string[];
    requiredInventory: { name: string; category: string }[];
    steps: {
      number: number;
      instruction: string;
      successCriteria: string;
      requiredObjects: string[];
      spatialHint?: string;
      hazardChecks: string[];
      instrumentReads: string[];
      expectedDurationSec: number;
    }[];
    sourceVideo: string;
  };
}

export const DEMO_EXAMPLES: DemoExample[] = [
  {
    id: "demo-tea",
    title: "Tea Preparation (Beginner)",
    videoUrl: "https://www.youtube.com/watch?v=AkHbLRuNP4M",
    thumbnailEmoji: "\u{1F375}",
    extractedAt: "2026-04-20T15:45:22.000Z",
    latencyMs: 8420,
    protocol: {
      id: "video-extracted-tea",
      name: "Traditional Loose-Leaf Tea Preparation",
      description: "Step-by-step preparation of loose-leaf tea with proper water temperature control, steeping time monitoring, and serving. Tests ER capabilities for liquid level detection, instrument reading (thermometer), and timing verification.",
      difficulty: "beginner",
      estimatedMinutes: 8,
      tags: ["cooking", "tea", "beverage", "beginner-friendly", "lab-os-kitchen"],
      requiredInventory: [
        { name: "Electric Kettle", category: "appliance" },
        { name: "Teapot or Infuser", category: "tool" },
        { name: "Tea Cup", category: "tool" },
        { name: "Loose-Leaf Tea", category: "ingredient" },
        { name: "Kitchen Thermometer", category: "tool" },
        { name: "Timer", category: "tool" },
        { name: "Teaspoon", category: "tool" },
      ],
      steps: [
        {
          number: 1,
          instruction: "Fill the electric kettle with fresh cold water and start heating.",
          successCriteria: "Kettle is filled with water and the power indicator is on.",
          requiredObjects: ["Electric Kettle"],
          spatialHint: "On the counter near a power outlet.",
          hazardChecks: ["Ensure kettle is on stable surface", "Check cord is not near water"],
          instrumentReads: [],
          expectedDurationSec: 30,
        },
        {
          number: 2,
          instruction: "Measure one teaspoon of loose-leaf tea and place it in the teapot infuser.",
          successCriteria: "Tea leaves are visible inside the infuser basket or teapot.",
          requiredObjects: ["Loose-Leaf Tea", "Teapot or Infuser", "Teaspoon"],
          spatialHint: "On the counter next to the kettle.",
          hazardChecks: [],
          instrumentReads: [],
          expectedDurationSec: 30,
        },
        {
          number: 3,
          instruction: "Check water temperature with thermometer. Target: 175-185\u00B0F (80-85\u00B0C) for green tea, or 200-212\u00B0F (93-100\u00B0C) for black tea.",
          successCriteria: "Thermometer is submerged in the heated water and displays a reading in the target range.",
          requiredObjects: ["Kitchen Thermometer", "Electric Kettle"],
          spatialHint: "Thermometer dipped into the kettle opening.",
          hazardChecks: ["Steam burn risk when opening kettle", "Hot water splash"],
          instrumentReads: ["Thermometer display: target 175-212\u00B0F depending on tea type"],
          expectedDurationSec: 60,
        },
        {
          number: 4,
          instruction: "Pour hot water over the tea leaves in the teapot. Fill to approximately 3/4 full.",
          successCriteria: "Hot water has been poured into the teapot over the tea leaves. Water level is approximately 3/4 of the teapot.",
          requiredObjects: ["Electric Kettle", "Teapot or Infuser"],
          spatialHint: "Pour from kettle into teapot on the counter.",
          hazardChecks: ["Hot water splash risk", "Steam burn risk"],
          instrumentReads: ["Liquid level in teapot (target ~75%)"],
          expectedDurationSec: 20,
        },
        {
          number: 5,
          instruction: "Start timer and steep for 3-5 minutes. Do not disturb the teapot.",
          successCriteria: "Timer is running and teapot lid is on. Tea is visibly steeping (water changing color).",
          requiredObjects: ["Teapot or Infuser", "Timer"],
          spatialHint: "Teapot on counter, timer nearby.",
          hazardChecks: ["Teapot handle may be hot"],
          instrumentReads: ["Timer countdown (3-5 min range)"],
          expectedDurationSec: 240,
        },
        {
          number: 6,
          instruction: "Remove the infuser or strain the tea. Pour into the tea cup.",
          successCriteria: "Infuser has been removed from teapot and tea is poured into the cup. No loose leaves in cup.",
          requiredObjects: ["Teapot or Infuser", "Tea Cup"],
          spatialHint: "Pour from teapot into cup on counter.",
          hazardChecks: ["Hot liquid pour risk"],
          instrumentReads: ["Liquid level in cup"],
          expectedDurationSec: 30,
        },
      ],
      sourceVideo: "https://www.youtube.com/watch?v=AkHbLRuNP4M",
    },
  },
  {
    id: "demo-steak",
    title: "Pan-Seared Ribeye (Intermediate)",
    videoUrl: "https://www.youtube.com/watch?v=N3gMfGnPuGs",
    thumbnailEmoji: "\u{1F969}",
    extractedAt: "2026-04-20T15:51:48.390Z",
    latencyMs: 9133,
    protocol: {
      id: "video-extracted-v1",
      name: "Pan-Seared Ribeye Steak",
      description: "Preparation of a pan-seared steak with butter basting. Tests ER capabilities for identifying raw vs. seared meat, detecting foaming butter, and monitoring temperature probes.",
      difficulty: "intermediate",
      estimatedMinutes: 15,
      tags: ["cooking", "steak", "searing", "lab-os-kitchen"],
      requiredInventory: [
        { name: "Ribeye Steak", category: "ingredient" },
        { name: "Salt and Pepper", category: "ingredient" },
        { name: "Unsalted Butter", category: "ingredient" },
        { name: "Cast Iron Skillet", category: "tool" },
        { name: "Tongs", category: "tool" },
        { name: "Meat Thermometer", category: "tool" },
      ],
      steps: [
        {
          number: 1,
          instruction: "Season both sides of the steak generously with salt and pepper.",
          successCriteria: "Steak surface is evenly coated with visible salt and pepper granules.",
          requiredObjects: ["Ribeye Steak", "Salt and Pepper"],
          spatialHint: "On the cutting board or clean flat surface.",
          hazardChecks: ["Raw meat cross-contamination"],
          instrumentReads: [],
          expectedDurationSec: 60,
        },
        {
          number: 2,
          instruction: "Heat the cast iron skillet until it begins to smoke slightly.",
          successCriteria: "Skillet surface shows visible wisps of smoke or oil shimmer.",
          requiredObjects: ["Cast Iron Skillet"],
          spatialHint: "On the primary burner.",
          hazardChecks: ["Extremely hot surface", "Handle may be hot"],
          instrumentReads: ["Surface temperature if using IR thermometer (expecting ~400\u00B0F+)"],
          expectedDurationSec: 180,
        },
        {
          number: 3,
          instruction: "Place steak in skillet and sear for 3 minutes without moving it.",
          successCriteria: "Steak is flat in pan; contact produces visible steam/sizzling.",
          requiredObjects: ["Ribeye Steak", "Cast Iron Skillet", "Tongs"],
          spatialHint: "Centered in the skillet.",
          hazardChecks: ["Hot oil splatter"],
          instrumentReads: [],
          expectedDurationSec: 180,
        },
        {
          number: 4,
          instruction: "Flip steak and add butter to the skillet.",
          successCriteria: "Seared side of steak is facing up (brown crust); butter is added to the pan.",
          requiredObjects: ["Tongs", "Unsalted Butter"],
          spatialHint: "In the skillet.",
          hazardChecks: ["Hot oil splatter"],
          instrumentReads: [],
          expectedDurationSec: 30,
        },
        {
          number: 5,
          instruction: "Baste the steak with melted butter using a spoon.",
          successCriteria: "Melted butter is actively being scooped over the top of the steak.",
          requiredObjects: ["Steak", "Unsalted Butter", "Spoon"],
          spatialHint: "Edge of skillet tilted towards handle.",
          hazardChecks: ["Burn hazard from hot liquid butter"],
          instrumentReads: [],
          expectedDurationSec: 120,
        },
        {
          number: 6,
          instruction: "Check internal temperature for desired doneness.",
          successCriteria: "Thermometer probe is inserted into the center of the steak.",
          requiredObjects: ["Meat Thermometer", "Steak"],
          spatialHint: "Inside the skillet.",
          hazardChecks: [],
          instrumentReads: ["Meat thermometer display (check for ~130\u00B0F for Medium-Rare)"],
          expectedDurationSec: 45,
        },
      ],
      sourceVideo: "https://www.youtube.com/watch?v=N3gMfGnPuGs",
    },
  },
];
