import React, { useState, useEffect, useContext } from "react"
import { ExtensionContext, ExtensionContextData } from "@looker/extension-sdk-react"
import { Looker31SDK as LookerSDK, Looker31SDK } from '@looker/sdk/lib/sdk/3.1/methods'
import { ILookmlModel, ILookmlModelExplore, IUser } from "@looker/sdk/lib/sdk/4.0/models"
import { FieldComments } from "../../src/components/interfaces";

const globalCache: any = {}

export function getCached<T>(key: string): T {
  return globalCache[key]
}

export async function loadCached<T>(
  key: string,
  callback: () => Promise<T>
): Promise<T> {
  if (globalCache[key]) {
    return getCached(key)
  } else {
    const val = await callback()
    /* eslint-disable require-atomic-updates */
    globalCache[key] = val
    return val
  }
}

export const loadCachedExplore = async (
  sdk: LookerSDK,
  modelName: string,
  exploreName: string
) => {
  return loadCached(`${modelName}|${exploreName}`, () =>
    sdk.ok(sdk.lookml_model_explore(modelName, exploreName))
  )
}

export const loadUsers = async (
  coreSDK: LookerSDK,
  ids: number[],
) => {
  // @ts-ignore
  return coreSDK.ok(coreSDK.all_users({ids: ids.toString() }))
}

export const loadAllModels = async (sdk: LookerSDK) => {
  return loadCached("all_lookml_models", () => sdk.ok(sdk.all_lookml_models()))
}

export const getMyUser = async (sdk: LookerSDK) => {
  return sdk.ok(sdk.me())
}

export function useAllModels() {
  const { coreSDK } = useContext(ExtensionContext)
  const [allModels, allModelsSetter] = useState<ILookmlModel[] | undefined>(undefined)
  useEffect(() => {
    async function fetcher() {
      allModelsSetter(await loadAllModels(coreSDK))
    }
    fetcher()
  }, [coreSDK])
  return allModels
}

export function useExplore(modelName?: string, exploreName?: string) {
  const { coreSDK } = useContext(ExtensionContext)
  const [currentExplore, exploreSetter] = useState<ILookmlModelExplore | undefined>(undefined)
  const [loadingExplore, loadingExploreSetter] = useState(null)
  useEffect(() => {
    async function fetcher() {
      if (modelName && exploreName) {
        loadingExploreSetter(exploreName)
        exploreSetter(await loadCachedExplore(coreSDK, modelName, exploreName))
        loadingExploreSetter(null)
      }
    }
    fetcher()
  }, [coreSDK, modelName, exploreName])
  return { loadingExplore, currentExplore }
}

export const loadModel = async (sdk: LookerSDK, modelName: string) => {
  return (await loadAllModels(sdk)).find(m => m.name === modelName)
}

export async function loadModelDetail(
  sdk: LookerSDK,
  modelName: string
): Promise<DetailedModel> {
  const model = await loadModel(sdk, modelName)
  const explores = await Promise.all(
    model.explores.map(explore => {
      return loadCachedExplore(sdk, model.name, explore.name)
    })
  )
  return {
    model,
    explores
  }
}

export function useModelDetail(modelName?: string) {
  const { coreSDK } = useContext(ExtensionContext)
  const [modelDetail, setModelDetail] = useState<DetailedModel | undefined>(undefined)
  useEffect(() => {
    async function fetcher() {
      if (modelName) {
        setModelDetail(await loadModelDetail(coreSDK, modelName))
      }
    }
    fetcher()
  }, [coreSDK, modelName])
  return modelDetail
}

export function getAuthorIds(commentString: string) {
  let comments = JSON.parse(commentString)
  let authorIds: number[] = [];

  let commentExplores = Object.keys(comments);
  commentExplores.forEach(i => {
    let commentExploreFields = Object.keys(comments[i]);
    commentExploreFields.forEach(j => {
      comments[i][j].forEach((c: FieldComments) => {
        if (!authorIds.includes(c.author)) {
          authorIds.push(c.author)
        }
      })
    })
  })
  return authorIds
}

export interface DetailedModel {
  model: ILookmlModel
  explores: ILookmlModelExplore[]
}

export function getComments(currentExplore: ILookmlModelExplore) {
  const extensionContext = useContext<ExtensionContextData>(ExtensionContext)
  const { extensionSDK, initializeError } = extensionContext
  const [canPersistContextData, setCanPersistContextData] = useState<boolean>(false)
  const { coreSDK } = useContext(ExtensionContext)
  const [authors, setAuthors] = React.useState<IUser[]>([])
  const [comments, setComments] = React.useState("{}")
  const [me, setMe] = React.useState<IUser>()

  const addComment = async (newCommentStr: string, field: string): Promise<void> => {
    let revivedComments = JSON.parse(comments)
    let newComment = JSON.parse(newCommentStr)
    revivedComments[currentExplore.name] ? null : revivedComments[currentExplore.name] = {}
    if (revivedComments[currentExplore.name][field]) {
      let revivedFields = revivedComments[currentExplore.name][field]
      revivedFields.push(newComment)
      revivedComments[currentExplore.name][field] = revivedFields
    } else {
      revivedComments[currentExplore.name][field] = [newComment]
    }
    if (canPersistContextData) {
      try {
        setComments(JSON.stringify(revivedComments))
        await extensionSDK.saveContextData(JSON.stringify(revivedComments))
      } catch (error) {
        console.log(error)
      }
    }
  }

  const editComment = async (modCommentStr: string, field: string): Promise<void> => {
    let revivedComments = JSON.parse(comments)
    let modComment = JSON.parse(modCommentStr)

    let newFieldComments = revivedComments[currentExplore.name][field].filter((d: FieldComments) => {
      return d.pk !== modComment.pk
    })
    newFieldComments.push(modComment)
    revivedComments[currentExplore.name][field] = newFieldComments

    if (canPersistContextData) {
      try {
        setComments(JSON.stringify(revivedComments))
        await extensionSDK.saveContextData(JSON.stringify(revivedComments))
      } catch (error) {
        console.log(error)
      }
    }
  }

  const deleteComment = async (delCommentStr: string, field: string): Promise<void> => {
    let revivedComments = JSON.parse(comments)
    let delComment = JSON.parse(delCommentStr)

    let newFieldComments = revivedComments[currentExplore.name][field].filter((d: any) => {
      return d.pk !== delComment.pk
    })
    revivedComments[currentExplore.name][field] = newFieldComments

    if (canPersistContextData) {
      try {
        setComments(JSON.stringify(revivedComments))
        await extensionSDK.saveContextData(JSON.stringify(revivedComments))
      } catch (error) {
        console.log(error)
      }
    }
  }

  useEffect(() => {
    const initialize = async () => {
      // Context requires Looker version 7.14.0. If not supported provide
      // default configuration object and disable saving of context data.
      let context
      try {
        context = await extensionSDK.getContextData()
        setCanPersistContextData(true)
        let authorIds = getAuthorIds(context)
        let contextObj = JSON.parse(context)
        if (currentExplore !== undefined) {
          if(!contextObj[currentExplore.name]) {
            contextObj[currentExplore.name] = {}
          }
        }
        setComments(JSON.stringify(contextObj))
        setAuthors(await loadUsers(coreSDK, authorIds))
        setMe(await getMyUser(coreSDK))
      } catch (error) {
        console.error(error)
      }
    }
    initialize()
  }, [typeof currentExplore])

  return { comments, authors, me, addComment, editComment, deleteComment }
}
