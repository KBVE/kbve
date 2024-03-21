interface Tab {
  id: string;
  title: string;
}

interface TabsConfig {
  categories: Tab[];
}

const tabs: TabsConfig = {
  categories: [
    { id: 'popular', title: 'Popular' },
    { id: 'beauty', title: 'Beauty' },
    { id: 'fashion', title: 'Fashion' },
    { id: 'car_motorcycle', title: 'Car & Motorcycle' },
  ],
};

export default tabs;