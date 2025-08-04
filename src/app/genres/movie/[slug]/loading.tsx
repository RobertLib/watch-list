import { LoadingSection } from "@/components/LoadingSpinner";

export default function Loading() {
  return (
    <div className="min-h-screen bg-black">
      <div className="bg-linear-to-t from-black via-gray-900/50 to-black">
        <div className="container mx-auto px-6 lg:px-8 py-16">
          <div className="text-center">
            <div className="h-12 bg-gray-700 rounded w-64 mx-auto mb-4 animate-pulse"></div>
            <div className="h-6 bg-gray-700 rounded w-96 mx-auto animate-pulse"></div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 lg:px-8 py-8">
        <LoadingSection title="Loading Movies..." rows={3} cols={6} />
      </div>
    </div>
  );
}
