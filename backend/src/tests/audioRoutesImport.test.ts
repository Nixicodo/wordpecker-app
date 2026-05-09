describe('audio route module import', () => {
  it('imports the audio routes without hanging the backend bootstrap', async () => {
    const module = await import('../api/audio/routes');
    expect(module.default).toBeDefined();
  });
});
