export class AnimatedSprite {
  private frameHeight: number;
  private currentFrame: number = 0;
  private elapsedTime: number = 0;
  private active: boolean = true;
  private scale: number;

  constructor(
    private image: CanvasImageSource,
    private frameWidth: number,
    private frameCount: number,
    private frameDuration: number, // in milliseconds
    private looping: boolean = false,
    private originX: number,
    private originY: number,
    scale: number = 1,
  ) {
    this.scale = scale;
    if ("height" in image) {
      this.frameHeight = (image as HTMLImageElement | HTMLCanvasElement).height;
    } else {
      throw new Error("Image source must have a 'height' property.");
    }
  }

  update(deltaTime: number) {
    if (!this.active) return;
    this.elapsedTime += deltaTime;
    if (this.elapsedTime >= this.frameDuration) {
      this.elapsedTime -= this.frameDuration;
      this.currentFrame++;

      if (this.currentFrame >= this.frameCount) {
        if (this.looping) {
          this.currentFrame = 0;
        } else {
          this.currentFrame = this.frameCount - 1;
          this.active = false;
        }
      }
    }
  }

  isActive(): boolean {
    return this.active;
  }

  lifeTime(): number | undefined {
    if (this.looping) {
      return undefined;
    }
    return this.frameDuration * this.frameCount;
  }

  draw(ctx: CanvasRenderingContext2D, x: number, y: number) {
    // Snap to integer pixels to avoid subpixel blending cost and blurriness
    const drawX = Math.round(x - this.originX * this.scale);
    const drawY = Math.round(y - this.originY * this.scale);

    ctx.drawImage(
      this.image,
      this.currentFrame * this.frameWidth,
      0,
      this.frameWidth,
      this.frameHeight,
      drawX,
      drawY,
      this.frameWidth * this.scale,
      this.frameHeight * this.scale,
    );
  }

  reset() {
    this.currentFrame = 0;
    this.elapsedTime = 0;
  }

  setOrigin(xRatio: number, yRatio: number) {
    this.originX = xRatio;
    this.originY = yRatio;
  }
}
