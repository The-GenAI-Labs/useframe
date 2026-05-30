import { memo } from "react";

export default memo(function GridBackground() {
    return (
        <div className="absolute inset-0 rounded-4xl bg-gray-800 overflow-hidden pointer-events-none">
            <img
                src="/chat/useframecloud.jpg"
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-white/30" />
            <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-white/50 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-white/60 to-transparent" />
            <div className="absolute top-0 left-0 bottom-0 w-24 bg-gradient-to-r from-white/40 to-transparent" />
            <div className="absolute top-0 right-0 bottom-0 w-24 bg-gradient-to-l from-white/40 to-transparent" />
            <div className="absolute inset-0 rounded-4xl" style={{ boxShadow: "inset 0 0 80px rgba(0,0,0,0.08)" }} />
        </div>
    );
});