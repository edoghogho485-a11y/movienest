import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, ArrowLeft } from 'lucide-react';

interface RoomErrorBoundaryProps {
  roomCode?: string;
  onBack: () => void;
  children: ReactNode;
}

interface RoomErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

// Catches runtime errors inside RoomPage so users see the error details and can return home
export class RoomErrorBoundary extends Component<
  RoomErrorBoundaryProps,
  RoomErrorBoundaryState
> {
  constructor(props: RoomErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: '',
    };
  }

  static getDerivedStateFromError(error: unknown): RoomErrorBoundaryState {
    const message =
      error instanceof Error
        ? error.message || error.name
        : typeof error === 'string'
          ? error
          : 'An unexpected error occurred while loading this room.';
    return {
      hasError: true,
      errorMessage: message,
    };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('RoomPage runtime error:', error, info);
  }

  componentDidUpdate(prevProps: RoomErrorBoundaryProps) {
    // Reset boundary if user navigates to a different room
    if (this.state.hasError && prevProps.roomCode !== this.props.roomCode) {
      this.setState({ hasError: false, errorMessage: '' });
    }
  }

  private handleBackToHome = () => {
    this.setState({ hasError: false, errorMessage: '' });
    this.props.onBack();
  };

  render() {
    if (this.state.hasError) {
      return (
        <section
          role="alert"
          className="mx-auto max-w-xl px-4 py-16 text-center sm:px-6"
        >
          <div className="rounded-2xl border border-[#2a2a33] bg-[#14141a] p-6 sm:p-8">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-[#E50914]/40 bg-[#1b1013]">
              <AlertTriangle className="h-6 w-6 text-[#E50914]" aria-hidden="true" />
            </div>

            <h1 className="mt-4 font-display text-2xl font-bold text-white">
              Could not display this room
            </h1>
            <p className="mt-2 text-sm text-zinc-400">
              Something went wrong while opening the screening room.
            </p>

            {this.state.errorMessage && (
              <div className="mt-4 rounded-xl border border-[#2a2a33] bg-[#08080A] px-4 py-3 text-left">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                  Error details
                </p>
                <p className="mt-1 break-words font-mono text-xs text-[#F87171]">
                  {this.state.errorMessage}
                </p>
              </div>
            )}

            <div className="mt-6 flex justify-center">
              <button
                type="button"
                onClick={this.handleBackToHome}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-[#E50914] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#F40612] active:bg-[#b80710] cursor-pointer"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                <span>Back to home</span>
              </button>
            </div>
          </div>
        </section>
      );
    }

    return this.props.children;
  }
}
