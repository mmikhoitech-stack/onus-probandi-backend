const transport = new StdioClientTransport({
    command: "npx",
    args: ["-y", "https://github.com/Ansvar-Systems/southafrica-law-mcp/archive/refs/heads/main.tar.gz"]
});
