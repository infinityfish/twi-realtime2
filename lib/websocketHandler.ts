import WebSocket from 'ws';
import { NextApiRequest } from 'next';
import { OPENAI_API_KEY, SYSTEM_MESSAGE, VOICE, LOG_EVENT_TYPES } from './constants';
import { processTranscriptAndSend } from './transcriptProcessor';

const sessions = new Map();

export function handleWebSocketConnection(connection: WebSocket, req: NextApiRequest) {
  console.log('Client connected');

  const sessionId = req.headers['x-twilio-call-sid'] as string || `session_${Date.now()}`;
  let session = sessions.get(sessionId) || { transcript: '', streamSid: null };
  sessions.set(sessionId, session);

  const openAiWs = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01', {
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "OpenAI-Beta": "realtime=v1"
    }
  });

  // ... (rest of the WebSocket handling logic)
  const sendSessionUpdate = () => {
    const sessionUpdate = {
        type: 'session.update',
        session: {
            turn_detection: { type: 'server_vad' },
            input_audio_format: 'g711_ulaw',
            output_audio_format: 'g711_ulaw',
            voice: VOICE,
            instructions: SYSTEM_MESSAGE,
            modalities: ["text", "audio"],
            temperature: 0.8,
            input_audio_transcription: {
                "model": "whisper-1"
            }
        }
    };

    console.log('Sending session update:', JSON.stringify(sessionUpdate));
    openAiWs.send(JSON.stringify(sessionUpdate));
};

// Open event for OpenAI WebSocket
openAiWs.on('open', () => {
    console.log('Connected to the OpenAI Realtime API');
    setTimeout(sendSessionUpdate, 250);
});

// Listen for messages from the OpenAI WebSocket
openAiWs.on('message', (data) => {
    try {
        const response = JSON.parse(data.toString());

        if (LOG_EVENT_TYPES.includes(response.type)) {
            console.log(`Received event: ${response.type}`, response);
        }

        // User message transcription handling
        if (response.type === 'conversation.item.input_audio_transcription.completed') {
            const userMessage = response.transcript.trim();
            session.transcript += `User: ${userMessage}\n`;
            console.log(`User (${sessionId}): ${userMessage}`);
        }

        // Agent message handling
        if (response.type === 'response.done') {
            const agentMessage = response.response.output[0]?.content?.find((content: { transcript: any; }) => content.transcript)?.transcript || 'Agent message not found';
            session.transcript += `Agent: ${agentMessage}\n`;
            console.log(`Agent (${sessionId}): ${agentMessage}`);
        }

        if (response.type === 'session.updated') {
            console.log('Session updated successfully:', response);
        }

        if (response.type === 'response.audio.delta' && response.delta) {
            const audioDelta = {
                event: 'media',
                streamSid: session.streamSid,
                media: { payload: Buffer.from(response.delta, 'base64').toString('base64') }
            };
            connection.send(JSON.stringify(audioDelta));
        }
    } catch (error) {
        console.error('Error processing OpenAI message:', error, 'Raw message:', data);
    }
});

// Handle incoming messages from Twilio
connection.on('message', (message) => {
    try {
        const data = JSON.parse(message.toString());

        switch (data.event) {
            case 'media':
                if (openAiWs.readyState === WebSocket.OPEN) {
                    const audioAppend = {
                        type: 'input_audio_buffer.append',
                        audio: data.media.payload
                    };

                    openAiWs.send(JSON.stringify(audioAppend));
                }
                break;
            case 'start':
                session.streamSid = data.start.streamSid;
                console.log('Incoming stream has started', session.streamSid);
                break;
            default:
                console.log('Received non-media event:', data.event);
                break;
        }
    } catch (error) {
        console.error('Error parsing message:', error, 'Message:', message);
    }
});

  // Remember to close the OpenAI WebSocket connection when the client disconnects
  connection.on('close', async () => {
    if (openAiWs.readyState === WebSocket.OPEN) openAiWs.close();
    console.log(`Client disconnected (${sessionId}).`);
    console.log('Full Transcript:');
    console.log(session.transcript);
    if (session.transcript) {
        // await processTranscriptAndSend(session.transcript, null);
        await processTranscriptAndSend(session.transcript, sessionId);
    } else {
        console.log('No transcript available for processing');
    }

    // Clean up the session
    sessions.delete(sessionId);
  });
}
