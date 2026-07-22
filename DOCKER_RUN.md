Running with Docker (recommended when host can't install Python packages)

1. Build the image:

   docker build -t stegochat:latest .

2. Run the container (maps port 5000):

   docker run --rm -p 5000:5000 --name stegochat stegochat:latest

3. Open the app in a browser:

   http://localhost:5000/chat

Notes:
- The Dockerfile installs system libs required by Pillow and the Python dependencies from requirements.txt.
- If you need persistent uploads, bind-mount the uploads directory:

   docker run --rm -p 5000:5000 -v $(pwd)/uploads:/app/uploads stegochat:latest

Troubleshooting:
- If the container build fails due to network or package mirrors, try rebuilding with --network=host or from a different network.
- Use the logs to inspect any runtime errors: docker logs -f stegochat
