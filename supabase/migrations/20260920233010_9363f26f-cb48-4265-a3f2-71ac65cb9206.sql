ALTER TABLE public.x_launch_requests ADD COLUMN tweet_text text;
COMMENT ON COLUMN public.x_launch_requests.tweet_text IS 'Original caller tweet text, embedded into the coin description at launch.';