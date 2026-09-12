"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

export type CameraHandle = {
  capture: () => string | null;
};

type CameraViewProps = {
  stream: MediaStream | null;
  onReady: () => void;
  onError: (message: string) => void;
};

export const CameraView = forwardRef<CameraHandle, CameraViewProps>(function CameraView(
  { stream, onReady, onError },
  ref,
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream) return;
    video.srcObject = stream;
    video.play().catch(() => onError("Tap the camera preview to start it."));
    return () => {
      video.srcObject = null;
    };
  }, [stream, onError]);

  useImperativeHandle(ref, () => ({
    capture() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return null;

      const sourceWidth = video.videoWidth;
      const sourceHeight = video.videoHeight;
      if (!sourceWidth || !sourceHeight) return null;
      const scale = Math.min(1, 768 / Math.max(sourceWidth, sourceHeight));
      canvas.width = Math.round(sourceWidth * scale);
      canvas.height = Math.round(sourceHeight * scale);
      const context = canvas.getContext("2d");
      if (!context) return null;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/jpeg", 0.7);
    },
  }));

  return (
    <>
      <video
        ref={videoRef}
        className="h-full w-full object-cover"
        autoPlay
        playsInline
        muted
        onLoadedData={onReady}
        onClick={() => videoRef.current?.play()}
        aria-label="Live rear camera preview"
      />
      <canvas ref={canvasRef} className="hidden" aria-hidden="true" />
    </>
  );
});
