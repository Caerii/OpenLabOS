import os
from pathlib import Path

from dotenv import load_dotenv
from livekit import agents
from livekit.agents import Agent, AgentServer, AgentSession, JobContext, room_io
from livekit.plugins import google

PROJECT_DIR = Path(__file__).resolve().parents[1]
load_dotenv(PROJECT_DIR / ".env.local")

AGENT_NAME = os.getenv("LABOS_AGENT_NAME", "openlabos-voice")
GEMINI_API_LIVE_MODEL = "gemini-2.5-flash-native-audio-preview-12-2025"
VERTEX_LIVE_MODEL = "gemini-live-2.5-flash-native-audio"
CONFIGURED_GEMINI_MODEL = os.getenv(
    "LABOS_GEMINI_LIVE_MODEL",
    GEMINI_API_LIVE_MODEL,
)
GEMINI_VOICE = os.getenv("LABOS_GEMINI_LIVE_VOICE", "Despina")
DASHBOARD_BASE_URL = os.getenv("LABOS_DASHBOARD_BASE_URL", "http://host.docker.internal:3847")
USE_VERTEXAI = os.getenv("GOOGLE_GENAI_USE_VERTEXAI", "").lower() == "true"
GOOGLE_CLOUD_PROJECT = os.getenv("GOOGLE_CLOUD_PROJECT") or None
GOOGLE_CLOUD_LOCATION = os.getenv("GOOGLE_CLOUD_LOCATION") or "us-central1"
GEMINI_MODEL = (
    VERTEX_LIVE_MODEL
    if USE_VERTEXAI and CONFIGURED_GEMINI_MODEL == GEMINI_API_LIVE_MODEL
    else CONFIGURED_GEMINI_MODEL
)


def realtime_model() -> google.realtime.RealtimeModel:
    options = {
        "model": GEMINI_MODEL,
        "voice": GEMINI_VOICE,
        "temperature": 0.55,
        "enable_affective_dialog": True,
        "proactivity": True,
    }
    if USE_VERTEXAI:
        options.update(
            {
                "vertexai": True,
                "project": GOOGLE_CLOUD_PROJECT,
                "location": GOOGLE_CLOUD_LOCATION,
            }
        )
    return google.realtime.RealtimeModel(**options)

LABOS_SYSTEM_INSTRUCTIONS = f"""
You are LabOS, a friendly hands-free copilot for physical lab and kitchen protocols.
You speak through smart glasses while watching the user's egocentric camera feed.
Be concise, warm, lightly funny, and British in tone. Do not over-narrate.

Your job is to help the operator complete the active protocol safely:
- Welcome the operator when a session starts.
- If they ask "what do I do next?", give the next concrete action.
- If the live view is unclear, ask them to look at the workspace instead of guessing.
- If you suspect deviation, frame it as a recoverable correction.
- Never claim that a step passed unless LabOS adherence context says it passed.
- Keep most replies to one or two short sentences.

The LabOS dashboard control plane is expected at {DASHBOARD_BASE_URL}.
Structured adherence events are owned by the dashboard; you provide natural voice and visual context.
"""


class LabOSCopilot(Agent):
    def __init__(self) -> None:
        super().__init__(
            instructions=LABOS_SYSTEM_INSTRUCTIONS,
            llm=realtime_model(),
        )


server = AgentServer()


@server.rtc_session(agent_name=AGENT_NAME)
async def labos_agent(ctx: JobContext):
    ctx.log_context_fields = {
        "room": ctx.room.name,
        "agent": AGENT_NAME,
        "gemini_model": GEMINI_MODEL,
        "gemini_voice": GEMINI_VOICE,
        "vertexai": str(USE_VERTEXAI),
    }

    session = AgentSession()

    await session.start(
        agent=LabOSCopilot(),
        room=ctx.room,
        room_options=room_io.RoomOptions(
            video_input=True,
        ),
    )

    await ctx.connect()


if __name__ == "__main__":
    agents.cli.run_app(server)
