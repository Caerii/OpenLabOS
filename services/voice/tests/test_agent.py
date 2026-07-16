import os


def test_agent_defaults_to_gemini_25_native_audio() -> None:
    from openlabos_voice import agent

    assert os.getenv("LABOS_AGENT_NAME", "openlabos-voice") == agent.AGENT_NAME
    assert agent.CONFIGURED_GEMINI_MODEL == agent.GEMINI_API_LIVE_MODEL
    if agent.USE_VERTEXAI:
        assert agent.GEMINI_MODEL == agent.VERTEX_LIVE_MODEL
    else:
        assert agent.GEMINI_MODEL == agent.GEMINI_API_LIVE_MODEL
    assert agent.GEMINI_VOICE == "Despina"


def test_labos_instructions_are_protocol_grounded() -> None:
    from openlabos_voice import agent

    instructions = agent.LABOS_SYSTEM_INSTRUCTIONS
    assert "smart glasses" in instructions
    assert "what do I do next" in instructions
    assert "Never claim that a step passed" in instructions
