"""
API Testing Script - For testing Data Agent HTTP interface
How to run:
1. Start the server first: python server.py
2. Run this script to test the API
"""

import argparse
import json
import requests
import time
from typing import Optional, List, Dict
from datetime import datetime


class DataAgentAPIClient:
    """Data Agent API client for testing endpoints"""

    def __init__(self, base_url: str = "http://localhost:10000"):
        """
        Initialize API client

        Args:
            base_url: Server address, defaults to http://localhost:10000
        """
        self.base_url = base_url.rstrip('/')
        self.chat_endpoint = f"{self.base_url}/api/chat/stream"

    def check_server_status(self) -> bool:
        """Check if server is running"""
        try:
            requests.get(self.base_url, timeout=2)
            return True
        except requests.exceptions.RequestException:
            return False

    def chat(
        self,
        user_input: str,
        session_id: str = "__default__"
    ) -> dict:
        """
        Send chat request to API

        Args:
            user_input: User's question
            session_id: Session ID for maintaining context (history managed by server)

        Returns:
            Dictionary containing full response
        """
        # Only send current user input, history managed by server via session_id
        messages = [{
            "role": "user",
            "content": user_input
        }]

        payload = {
            "messages": messages,
            "session_id": session_id
        }

        print(f"\n{'='*60}")
        print(f"Sending request: {user_input}")
        print(f"Session ID: {session_id}")
        print(f"{'='*60}\n")

        try:
            # Send POST request (streaming response)
            response = requests.post(
                self.chat_endpoint,
                json=payload,
                headers={"Content-Type": "application/json"},
                stream=True,
                timeout=180
            )

            if response.status_code != 200:
                return {
                    "success": False,
                    "error": f"HTTP {response.status_code}: {response.text}",
                    "user_input": user_input,
                    "response": "",
                    "events": []
                }

            # Parse streaming response
            events = []
            full_response = ""
            current_event_type = None
            last_message_id = None

            print("Receiving response stream:\n")

            for line in response.iter_lines(decode_unicode=True):
                if not line or line.strip() == "":
                    continue

                # Parse SSE format
                if line.startswith("event:"):
                    current_event_type = line.split(":", 1)[1].strip()
                elif line.startswith("data:"):
                    data_str = line.split(":", 1)[1].strip()
                    try:
                        data = json.loads(data_str)
                        events.append({
                            "type": current_event_type or "unknown",
                            "data": data
                        })

                        content = data.get("content", "")
                        message_id = data.get("id", "")

                        if content and isinstance(content, str):
                            # Add line break when message ID changes (new LLM call)
                            # This automatically separates different phases without maintaining a fixed list
                            if last_message_id and message_id != last_message_id and not content.startswith('\n'):
                                print()
                                full_response += '\n'

                            full_response += content
                            print(content, end="", flush=True)
                            last_message_id = message_id
                    except json.JSONDecodeError:
                        print(f"\n[Warning] Failed to parse JSON: {data_str}")

            print("\n")

            return {
                "success": True,
                "user_input": user_input,
                "response": full_response,
                "events": events,
                "session_id": session_id
            }

        except requests.exceptions.Timeout:
            return {
                "success": False,
                "error": "Request timeout",
                "user_input": user_input,
                "response": "",
                "events": []
            }
        except requests.exceptions.ConnectionError:
            return {
                "success": False,
                "error": "Cannot connect to server. Make sure server.py is running",
                "user_input": user_input,
                "response": "",
                "events": []
            }
        except Exception as e:
            return {
                "success": False,
                "error": f"Request failed: {str(e)}",
                "user_input": user_input,
                "response": "",
                "events": []
            }

    def interactive_chat(self):
        """Interactive chat mode - supports multi-turn conversations"""
        print("\n" + "="*60)
        print("Data Agent API Testing Console - Multi-turn Chat Mode")
        print("="*60)
        print("Make sure server.py is running!")
        print("\nCommands:")
        print("  - Type your message: Send message (maintains current session context)")
        print("  - 'new' or 'reset': Start a new session")
        print("  - 'exit', 'quit', or 'q': Exit program")
        print("="*60 + "\n")

        # Check server status
        if not self.check_server_status():
            print("⚠️  Warning: Cannot connect to server!")
            print(f"   Please run: python server.py")
            print(f"   Server address: {self.base_url}\n")
            response = input("Continue anyway? (y/n): ")
            if response.lower() != 'y':
                return
        else:
            print(f"✓ Server connected: {self.base_url}\n")

        # Generate initial session ID
        session_id = f"session_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        message_count = 0

        print(f"📝 Current session ID: {session_id}")
        print(f"💡 Tip: Session context is automatically managed by server for multi-turn conversations\n")

        while True:
            try:
                user_input = input("You: ").strip()

                if not user_input:
                    continue

                # Exit commands
                if user_input.lower() in ['exit', 'quit', 'q']:
                    print("\n👋 Goodbye!")
                    break

                # Start new session
                if user_input.lower() in ['new', 'reset']:
                    session_id = f"session_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
                    message_count = 0
                    print(f"\n🔄 New session created")
                    print(f"📝 Session ID: {session_id}\n")
                    continue

                # Send request (history automatically managed by server via session_id)
                result = self.chat(user_input=user_input, session_id=session_id)

                if result["success"]:
                    message_count += 1
                    print(f"\n💬 Sent {message_count} message(s)")
                    print(f"{'='*60}\n")
                else:
                    print(f"\n❌ Error: {result.get('error', 'Unknown error')}\n")
                    print(f"{'='*60}\n")

            except KeyboardInterrupt:
                print("\n\n👋 Goodbye!")
                break
            except Exception as e:
                print(f"\n❌ Error: {str(e)}\n")


def single_question_test(
    question: str,
    base_url: str = "http://localhost:10000",
    session_id: str = "__default__",
    output_file: Optional[str] = None
):
    """Test a single question"""
    client = DataAgentAPIClient(base_url)

    # Check server
    if not client.check_server_status():
        print(f"❌ Error: Cannot connect to server {base_url}")
        print("   Please run: python server.py")
        return

    print(f"✓ Server connected")

    # Send request
    result = client.chat(user_input=question, session_id=session_id)

    # Print results
    print("\n" + "="*60)
    print("Test Results")
    print("="*60)

    if result["success"]:
        print(f"✓ Request successful")
        print(f"\nUser input: {result['user_input']}")
        print(f"\nAgent response:\n{result['response']}")

        # Save to file
        if output_file:
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(result, f, ensure_ascii=False, indent=2)
            print(f"\nResults saved to: {output_file}")
    else:
        print(f"❌ Request failed")
        print(f"Error: {result.get('error', 'Unknown error')}")

    print("="*60)


def main():
    parser = argparse.ArgumentParser(
        description="Data Agent API Testing Tool",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Interactive multi-turn chat mode (default)
  python test_api.py
  
  # Test a single question
  python test_api.py -q "Hello, please introduce yourself"
  
  # Specify server address
  python test_api.py --url http://localhost:10000
  
  # Save results to file
  python test_api.py -q "Query sales data" -o result.json
  
  # Use specific session ID (for multi-turn conversation testing)
  python test_api.py -q "My name is John" -t my-session-001
  
Interactive mode:
  - After sending a message, session context is automatically managed by server (via session_id)
  - Type 'new' or 'reset' to start a new session (generates new session_id)
  - Type 'exit', 'quit', or 'q' to quit
        """
    )

    parser.add_argument(
        "-q", "--question",
        type=str,
        help="Question to test (single test mode)"
    )

    parser.add_argument(
        "--url",
        type=str,
        default="http://localhost:10000",
        help="Server address (default: http://localhost:10000)"
    )

    parser.add_argument(
        "-t", "--session-id",
        type=str,
        default="__default__",
        help="Session ID (default: __default__)"
    )

    parser.add_argument(
        "-o", "--output",
        type=str,
        help="File path to save results (JSON format)"
    )

    parser.add_argument(
        "-i", "--interactive",
        action="store_true",
        help="Force interactive mode"
    )

    args = parser.parse_args()

    if args.question:
        # Single test mode
        single_question_test(
            question=args.question,
            base_url=args.url,
            session_id=args.session_id,
            output_file=args.output
        )
    else:
        # Interactive mode
        client = DataAgentAPIClient(args.url)
        client.interactive_chat()


if __name__ == "__main__":
    main()