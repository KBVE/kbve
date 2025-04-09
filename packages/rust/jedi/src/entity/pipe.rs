pub trait Pipe: Sized {
    fn pipe<F, T>(self, f: F) -> T
    where
      F: FnOnce(Self) -> T,
    {
      f(self)
    }
  
    fn pipe_if<F>(self, cond: bool, f: F) -> Self
    where
      F: FnOnce(Self) -> Self,
    {
      if cond { f(self) } else { self }
    }
  
    fn tap<F>(self, f: F) -> Self
    where
      F: FnOnce(&Self),
    {
      f(&self);
      self
    }
  
    fn pipe_ok<T, E, F>(self, f: F) -> Result<T, E>
    where
      Self: Into<Result<T, E>>,
      F: FnOnce(T) -> Result<T, E>,
    {
      self.into().and_then(f)
    }
  }
  
  impl<T> Pipe for T {}
  