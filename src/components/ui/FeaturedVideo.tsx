// Looping, muted product video for a featured card. The poster image is shown until the video
// plays, and is also the fallback for browsers that cannot play the video.
interface FeaturedVideoProps {
  src: string;
  poster: string;
  type?: string;
}

export function FeaturedVideo({ src, poster, type = "video/webm" }: FeaturedVideoProps) {
  return (
    <video
      className="absolute inset-0 h-full w-full object-cover"
      poster={poster}
      autoPlay
      muted
      loop
      playsInline
      preload="auto"
      aria-hidden="true"
    >
      <source src={src} type={type} />
      {/* Fallback for browsers without video support. A plain img is intended here inside the video. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={poster} alt="" className="h-full w-full object-cover" />
    </video>
  );
}
