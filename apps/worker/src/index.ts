console.log("worker started");

process.on("SIGINT", () => {
  console.log("worker stopping");
  process.exit(0);
});
