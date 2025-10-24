export type NpmPackageInfo = {
  _id: string;
  _rev: string;
  name: string;
  "dist-tags": {
    latest: string;
  };
  versions: {
    [key: string]: { name: string; version: string };
  };

  readme: string;
  readmeFilename: string;
};

export type FetchData = {
  categoryTitle: string;
  descriptionEn: string;
  descriptionKo: string;
  examples: {
    title: string;
    descriptionEn: string;
    descriptionKo: string;
    files: {
      fileName: string;
      fileType: string;
      path: string;
      code: string;
    }[];
  }[];
};
